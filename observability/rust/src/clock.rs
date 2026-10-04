//! Process-local monotonic epoch mapping. Calibration never alters the OS clock.
use serde::Serialize;
use std::{
    sync::{OnceLock, RwLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Calibration {
    pub offset_ms: f64,
    pub uncertainty_ms: f64,
    pub calibrated_at_ms: f64,
}
#[derive(Debug)]
struct Clock {
    epoch: SystemTime,
    monotonic: Instant,
    calibration: RwLock<Option<Calibration>>,
}
static CLOCK: OnceLock<Clock> = OnceLock::new();
fn clock() -> &'static Clock {
    CLOCK.get_or_init(|| Clock {
        epoch: SystemTime::now(),
        monotonic: Instant::now(),
        calibration: RwLock::new(None),
    })
}
pub fn raw_now() -> SystemTime {
    let c = clock();
    c.epoch + c.monotonic.elapsed()
}
pub fn millis(t: SystemTime) -> f64 {
    t.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
        * 1000.0
}
pub fn calibration() -> Option<Calibration> {
    (*clock().calibration.read().unwrap()).filter(|c| {let age=millis(raw_now())-c.calibrated_at_ms; (0.0..=300_000.0).contains(&age)})
}
pub fn now() -> SystemTime {
    let t = raw_now();
    let offset = calibration().map_or(0.0, |c| c.offset_ms);
    let delta = Duration::from_secs_f64(offset.abs() / 1000.0);
    if offset >= 0.0 {
        t + delta
    } else {
        t.checked_sub(delta).unwrap_or(UNIX_EPOCH)
    }
}
/// The interval, rather than a point estimate, is the honest result under asymmetric latency.
pub fn estimate(t1: f64, t2: f64, t3: f64, t4: f64) -> Option<Calibration> {
    if ![t1, t2, t3, t4].iter().all(|v| v.is_finite()) || t4 < t1 || t3 < t2 {
        return None;
    }
    let rtt = (t4 - t1) - (t3 - t2);
    if rtt < -0.1 {
        return None;
    }
    Some(Calibration {
        offset_ms: ((t2 - t1) + (t3 - t4)) / 2.0,
        uncertainty_ms: rtt.max(0.0) / 2.0,
        calibrated_at_ms: t4,
    })
}
pub fn set_calibration(value: Calibration) {
    *clock().calibration.write().unwrap() = Some(value);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn asymmetric_path_contains_real_offset() {
        // Server is ahead 5s, outbound takes 20ms, inbound 80ms, handler 10ms.
        let c = estimate(1000.0, 6020.0, 6030.0, 1110.0).unwrap();
        assert!((c.offset_ms - 4970.0).abs() < 0.01);
        assert!(
            5000.0 >= c.offset_ms - c.uncertainty_ms && 5000.0 <= c.offset_ms + c.uncertainty_ms
        );
    }
    #[test]
    fn rejects_clock_reset_and_bad_samples() {
        assert!(estimate(10.0, 20.0, 21.0, 9.0).is_none());
        assert!(estimate(10.0, 20.0, 50.0, 15.0).is_none());
        assert!(estimate(f64::NAN, 0.0, 0.0, 0.0).is_none());
    }
}
