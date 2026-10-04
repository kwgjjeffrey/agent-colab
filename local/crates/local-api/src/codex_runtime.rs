//! Long-lived Codex app-server runtime.
//!
//! One Local Core owns one app-server process and keeps writer subscriptions for every
//! Colab-managed thread. Independent Channel commands enter Codex's own per-thread queue; a second
//! `turn/start` would steer the active turn and must never be used as an implicit queue.

use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    ffi::{OsStr, OsString},
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

const EXECUTION_LIMIT: Duration = Duration::from_secs(15 * 60);

#[derive(Clone)]
pub(super) struct CodexManager {
    commands: mpsc::Sender<ManagerCommand>,
}

pub(super) struct SubmitRequest {
    pub request_id: String,
    pub existing_thread: Option<String>,
    pub cwd: PathBuf,
    pub title: String,
    pub prompt: String,
}

pub(super) struct CodexSubmission {
    pub thread_id: String,
    completion: mpsc::Receiver<std::io::Result<()>>,
    events: mpsc::Receiver<Value>,
}

impl CodexSubmission {
    pub async fn finish(self) -> std::io::Result<Vec<Value>> {
        let Self { completion, events, .. } = self;
        let event_collector = tokio::task::spawn_blocking(move || events.into_iter().collect::<Vec<_>>());
        tokio::task::spawn_blocking(move || {
            completion
                .recv_timeout(EXECUTION_LIMIT)
                .map_err(|error| {
                    io_error(format!(
                        "Codex queued turn did not complete in time: {error}"
                    ))
                })?
        })
        .await
        .map_err(|error| io_error(format!("Codex completion waiter failed: {error}")))??;
        event_collector.await.map_err(|error| io_error(format!("Codex event collector failed: {error}")))
    }
}

impl CodexManager {
    pub fn new(binary: Option<OsString>) -> Self {
        let (commands, receiver) = mpsc::channel();
        thread::Builder::new()
            .name("agent-colab-codex".into())
            .spawn(move || worker(binary, receiver))
            .expect("spawn Codex manager");
        Self { commands }
    }

    pub async fn submit(&self, request: SubmitRequest) -> std::io::Result<CodexSubmission> {
        let (accepted_tx, accepted_rx) = mpsc::channel();
        let (completion_tx, completion_rx) = mpsc::channel();
        let (events_tx, events_rx) = mpsc::channel();
        self.commands
            .send(ManagerCommand::Submit {
                request,
                accepted: accepted_tx,
                completed: completion_tx,
                events: events_tx,
            })
            .map_err(|_| io_error("Codex manager stopped"))?;
        let thread_id = tokio::task::spawn_blocking(move || accepted_rx.recv())
            .await
            .map_err(|error| io_error(format!("Codex acceptance waiter failed: {error}")))?
            .map_err(|_| io_error("Codex manager stopped before accepting the command"))??;
        Ok(CodexSubmission {
            thread_id,
            completion: completion_rx,
            events: events_rx,
        })
    }
}

enum ManagerCommand {
    Submit {
        request: SubmitRequest,
        accepted: mpsc::Sender<std::io::Result<String>>,
        completed: mpsc::Sender<std::io::Result<()>>,
        events: mpsc::Sender<Value>,
    },
}

struct PendingJob {
    client_message_id: String,
    completed: mpsc::Sender<std::io::Result<()>>,
    events: mpsc::Sender<Value>,
}

struct ActiveJob {
    turn_id: String,
    job: Option<PendingJob>,
}

#[derive(Default)]
struct ThreadState {
    pending: VecDeque<PendingJob>,
    active: Option<ActiveJob>,
}

struct Session {
    child: Child,
    input: ChildStdin,
    events: mpsc::Receiver<std::io::Result<String>>,
    next_request_id: i64,
    loaded_threads: HashSet<String>,
    threads: HashMap<String, ThreadState>,
}

fn worker(binary: Option<OsString>, commands: mpsc::Receiver<ManagerCommand>) {
    let Some(binary) = binary else {
        while let Ok(command) = commands.recv() {
            fail_command(command, "No Codex executable is available on this device");
        }
        return;
    };
    let mut session: Option<Session> = None;
    loop {
        if session.is_none() {
            let command = match commands.recv() {
                Ok(command) => command,
                Err(_) => return,
            };
            match Session::start(&binary) {
                Ok(mut started) => {
                    if let Err(error) = started.handle(command) {
                        started.fail_all(error.to_string());
                    }
                    session = Some(started);
                }
                Err(error) => {
                    fail_command(command, error.to_string());
                    thread::sleep(Duration::from_secs(1));
                }
            }
            continue;
        }
        let running = session.as_mut().expect("session exists");
        loop {
            match commands.try_recv() {
                Ok(command) => {
                    if let Err(error) = running.handle(command) {
                        running.fail_all(error.to_string());
                    }
                }
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => {
                    running.shutdown();
                    return;
                }
            }
        }
        match running.events.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(line)) => running.dispatch_line(&line),
            Ok(Err(error)) => {
                running.fail_all(error.to_string());
                running.shutdown();
                session = None;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                running.fail_all("Codex app-server stopped");
                running.shutdown();
                session = None;
            }
        }
    }
}

impl Session {
    fn start(binary: &OsStr) -> std::io::Result<Self> {
        let mut child = Command::new(binary)
            .arg("app-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let input = child
            .stdin
            .take()
            .ok_or_else(|| io_error("Codex app-server stdin missing"))?;
        let output = child
            .stdout
            .take()
            .ok_or_else(|| io_error("Codex app-server stdout missing"))?;
        let (sender, events) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        let mut session = Self {
            child,
            input,
            events,
            next_request_id: 1,
            loaded_threads: HashSet::new(),
            threads: HashMap::new(),
        };
        session.request(
            "initialize",
            json!({
                "clientInfo": {"name": "agent-colab-runtime", "version": env!("CARGO_PKG_VERSION")},
                "capabilities": {"experimentalApi": true}
            }),
            Duration::from_secs(60),
        )?;
        send(&mut session.input, json!({"method": "initialized"}))?;
        Ok(session)
    }

    fn handle(&mut self, command: ManagerCommand) -> std::io::Result<()> {
        let ManagerCommand::Submit {
            request,
            accepted,
            completed,
            events,
        } = command;
        let thread_id = match self.ensure_thread(&request) {
            Ok(thread_id) => thread_id,
            Err(error) => {
                let _ = accepted.send(Err(io_error(error.to_string())));
                return Ok(());
            }
        };
        let client_message_id = request.request_id.clone();
        self.threads
            .entry(thread_id.clone())
            .or_default()
            .pending
            .push_back(PendingJob {
                client_message_id: client_message_id.clone(),
                completed,
                events,
            });
        let enqueue = self.request(
            "thread/queue/add",
            json!({
                "threadId": thread_id,
                "input": [{"type": "text", "text": request.prompt}],
                "clientUserMessageId": client_message_id
            }),
            Duration::from_secs(30),
        );
        match enqueue {
            Ok(_) => {
                let _ = accepted.send(Ok(thread_id));
            }
            Err(error) => {
                if let Some(state) = self.threads.get_mut(&thread_id)
                    && let Some(index) = state
                        .pending
                        .iter()
                        .position(|job| job.client_message_id == client_message_id)
                    && let Some(job) = state.pending.remove(index)
                {
                    let _ = job.completed.send(Err(io_error(error.to_string())));
                }
                let _ = accepted.send(Err(error));
            }
        }
        Ok(())
    }

    fn ensure_thread(&mut self, request: &SubmitRequest) -> std::io::Result<String> {
        if let Some(thread_id) = &request.existing_thread
            && self.loaded_threads.contains(thread_id)
        {
            return Ok(thread_id.clone());
        }
        let (thread_id, owns_thread) = if let Some(thread_id) = &request.existing_thread {
            match self.request(
                "thread/resume",
                json!({
                    "threadId": thread_id,
                    "cwd": request.cwd,
                    "excludeTurns": true,
                    "approvalPolicy": "on-request",
                    "sandbox": "workspace-write"
                }),
                Duration::from_secs(90),
            ) {
                Ok(response) => (
                    response
                        .pointer("/result/thread/id")
                        .and_then(Value::as_str)
                        .unwrap_or(thread_id)
                        .to_string(),
                    true,
                ),
                Err(error) if is_missing_thread(&error) => (self.start_thread(request)?, true),
                // Writer ownership is an app-server subscription, not the durable identity of
                // the Colab thread. Codex Desktop may acquire the writer while Local Core is
                // restarting. The public provider queue still accepts an independent submission
                // for that exact thread, so preserve the binding instead of rotating history.
                Err(error) if is_active_writer(&error) => (thread_id.clone(), false),
                Err(error) => return Err(error),
            }
        } else {
            (self.start_thread(request)?, true)
        };
        if owns_thread && !self.loaded_threads.contains(&thread_id) {
            // A foreign writer owns settings/name while subscribed. Those properties already
            // belong to the persisted thread; only a successfully resumed or newly started
            // thread is marked loaded and mutated by this app-server.
            self.request(
                "thread/settings/update",
                json!({
                    "threadId": thread_id,
                    "cwd": request.cwd,
                    "approvalPolicy": "on-request",
                    "sandboxPolicy": {
                        "type": "workspaceWrite",
                        "networkAccess": true,
                        "writableRoots": [request.cwd]
                    }
                }),
                Duration::from_secs(30),
            )?;
            self.request(
                "thread/name/set",
                json!({"threadId": thread_id, "name": request.title}),
                Duration::from_secs(30),
            )?;
            self.loaded_threads.insert(thread_id.clone());
        }
        self.threads.entry(thread_id.clone()).or_default();
        Ok(thread_id)
    }

    fn start_thread(&mut self, request: &SubmitRequest) -> std::io::Result<String> {
        let response = self.request(
            "thread/start",
            json!({
                "cwd": request.cwd,
                "ephemeral": false,
                "approvalPolicy": "on-request",
                "sandbox": "workspace-write",
                "developerInstructions": "This task is owned by an Agent Colab blueprint. The human owner may inspect it in Codex Desktop."
            }),
            Duration::from_secs(90),
        )?;
        response
            .pointer("/result/thread/id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| io_error(format!("Codex did not return a thread id: {response}")))
    }

    fn request(
        &mut self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> std::io::Result<Value> {
        let id = self.next_request_id;
        self.next_request_id += 1;
        send(
            &mut self.input,
            json!({"id": id, "method": method, "params": params}),
        )?;
        let deadline = Instant::now() + timeout;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(io_error(format!(
                    "Codex app-server request {method} timed out"
                )));
            }
            let line = self
                .events
                .recv_timeout(remaining)
                .map_err(|_| io_error(format!("Codex app-server stopped during {method}")))??;
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if value.get("id").and_then(Value::as_i64) == Some(id) {
                if value.get("error").is_some() {
                    return Err(io_error(format!("Codex {method} failed: {value}")));
                }
                return Ok(value);
            }
            self.dispatch(value);
        }
    }

    fn dispatch_line(&mut self, line: &str) {
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            self.dispatch(value);
        }
    }

    fn dispatch(&mut self, event: Value) {
        match event.get("method").and_then(Value::as_str) {
            Some("turn/started") => {
                let Some(thread_id) = event.pointer("/params/threadId").and_then(Value::as_str)
                else {
                    return;
                };
                let Some(turn_id) = event.pointer("/params/turn/id").and_then(Value::as_str) else {
                    return;
                };
                record_turn_started(&mut self.threads, thread_id, turn_id);
                forward_active_event(&mut self.threads, thread_id, &event);
            }
            Some("turn/completed") => {
                let Some(thread_id) = event.pointer("/params/threadId").and_then(Value::as_str)
                else {
                    return;
                };
                let Some(turn_id) = event.pointer("/params/turn/id").and_then(Value::as_str) else {
                    return;
                };
                forward_active_event(&mut self.threads, thread_id, &event);
                record_turn_completed(&mut self.threads, thread_id, turn_id, &event);
            }
            _ => {
                if let Some(thread_id) = event.pointer("/params/threadId").and_then(Value::as_str) {
                    forward_active_event(&mut self.threads, thread_id, &event);
                }
            }
        }
    }

    fn fail_all(&mut self, message: impl Into<String>) {
        let message = message.into();
        for state in self.threads.values_mut() {
            if let Some(active) = state.active.take()
                && let Some(job) = active.job
            {
                let _ = job.completed.send(Err(io_error(message.clone())));
            }
            while let Some(job) = state.pending.pop_front() {
                let _ = job.completed.send(Err(io_error(message.clone())));
            }
        }
    }

    fn shutdown(&mut self) {
        for thread_id in self.loaded_threads.clone() {
            let _ = self.request(
                "thread/unsubscribe",
                json!({"threadId": thread_id}),
                Duration::from_secs(2),
            );
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn record_turn_started(threads: &mut HashMap<String, ThreadState>, thread_id: &str, turn_id: &str) {
    let state = threads.entry(thread_id.to_string()).or_default();
    if state.active.is_none() {
        // `thread/queue/add` is FIFO within one provider thread. Pair the provider's next started
        // turn with our next accepted Server request; do not infer identity from prompt text.
        state.active = Some(ActiveJob {
            turn_id: turn_id.to_string(),
            job: state.pending.pop_front(),
        });
    }
}

fn forward_active_event(threads: &mut HashMap<String, ThreadState>, thread_id: &str, event: &Value) {
    if let Some(job) = threads.get(thread_id).and_then(|state| state.active.as_ref()).and_then(|active| active.job.as_ref()) {
        let _ = job.events.send(event.clone());
    }
}

fn record_turn_completed(
    threads: &mut HashMap<String, ThreadState>,
    thread_id: &str,
    turn_id: &str,
    event: &Value,
) {
    let status = event
        .pointer("/params/turn/status")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let Some(state) = threads.get_mut(thread_id) else {
        return;
    };
    let Some(active) = state.active.take() else {
        return;
    };
    if active.turn_id != turn_id {
        state.active = Some(active);
        return;
    }
    if let Some(job) = active.job {
        let result = if status == "completed" {
            Ok(())
        } else {
            Err(io_error(format!(
                "Codex turn {turn_id} ended with status {status}: {event}"
            )))
        };
        let _ = job.completed.send(result);
    }
}

fn fail_command(command: ManagerCommand, message: impl Into<String>) {
    let message = message.into();
    let ManagerCommand::Submit {
        accepted,
        completed,
        events: _,
        ..
    } = command;
    let _ = accepted.send(Err(io_error(message.clone())));
    let _ = completed.send(Err(io_error(message)));
}

fn is_missing_thread(error: &std::io::Error) -> bool {
    let message = error.to_string();
    message.contains("thread not found") || message.contains("Thread not found")
}

fn is_active_writer(error: &std::io::Error) -> bool {
    error.to_string().contains("already has an active writer")
}

fn send(input: &mut impl Write, value: Value) -> std::io::Result<()> {
    serde_json::to_writer(&mut *input, &value)?;
    input.write_all(b"\n")?;
    input.flush()
}

fn io_error(message: impl Into<String>) -> std::io::Error {
    std::io::Error::other(message.into())
}

#[cfg(test)]
mod tests {
    use super::{
        HashMap, PendingJob, ThreadState, io_error, is_active_writer, is_missing_thread,
        record_turn_completed, record_turn_started,
    };
    use serde_json::json;
    use std::sync::mpsc;

    #[test]
    fn only_a_missing_provider_thread_replaces_a_binding() {
        assert!(is_missing_thread(&io_error("thread not found: abc")));
        assert!(!is_missing_thread(&io_error(
            "thread abc already has an active writer"
        )));
        assert!(is_active_writer(&io_error(
            "thread abc already has an active writer"
        )));
        assert!(!is_missing_thread(&io_error("provider unavailable")));
    }

    #[test]
    fn provider_turns_complete_accepted_requests_in_fifo_order() {
        let (first_tx, first_rx) = mpsc::channel();
        let (second_tx, second_rx) = mpsc::channel();
        let (first_events, _) = mpsc::channel();
        let (second_events, _) = mpsc::channel();
        let mut state = ThreadState::default();
        state.pending.push_back(PendingJob {
            client_message_id: "request-1".into(),
            completed: first_tx,
            events: first_events,
        });
        state.pending.push_back(PendingJob {
            client_message_id: "request-2".into(),
            completed: second_tx,
            events: second_events,
        });
        let mut threads = HashMap::from([("thread-1".into(), state)]);

        record_turn_started(&mut threads, "thread-1", "turn-1");
        record_turn_completed(
            &mut threads,
            "thread-1",
            "turn-1",
            &json!({"params":{"turn":{"status":"completed"}}}),
        );
        assert!(first_rx.recv().expect("first completion").is_ok());
        assert!(second_rx.try_recv().is_err());

        record_turn_started(&mut threads, "thread-1", "turn-2");
        record_turn_completed(
            &mut threads,
            "thread-1",
            "turn-2",
            &json!({"params":{"turn":{"status":"interrupted"}}}),
        );
        assert!(second_rx.recv().expect("second completion").is_err());
    }
}
