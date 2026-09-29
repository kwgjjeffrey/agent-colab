//! Durable invitation-email delivery worker.

use std::{sync::Arc, time::Duration};

pub(crate) fn spawn(
    database: colab_server_persistence::Database,
    sender: Arc<dyn colab_server_email::EmailSender>,
    public_url: String,
) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(5));
        loop {
            tick.tick().await;
            let job = match database.claim_email().await {
                Ok(job) => job,
                Err(error) => {
                    eprintln!("claim email outbox failed: {error:#}");
                    continue;
                }
            };
            let Some(job) = job else {
                continue;
            };
            let accept_url = format!(
                "{}/invitations/{}",
                public_url.trim_end_matches('/'),
                job.token
            );
            let result = sender
                .send_organization_invite(colab_server_email::OrganizationInvite {
                    to: &job.to,
                    organization: &job.organization_name,
                    inviter: &job.inviter_name,
                    accept_url: &accept_url,
                })
                .await;
            match result {
                Ok(()) => {
                    if let Err(error) = database.complete_email(job.id).await {
                        eprintln!("complete email outbox failed: {error:#}");
                    }
                }
                Err(error) => {
                    eprintln!(
                        "send invitation failed (attempt {}): {error:#}",
                        job.attempts
                    );
                    if let Err(store_error) =
                        database.retry_email(job.id, &format!("{error:#}")).await
                    {
                        eprintln!("retry email outbox failed: {store_error:#}");
                    }
                }
            }
        }
    });
}
