use serde::Serialize;
pub mod session_chunks;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStatus {
    pub service: &'static str,
    pub version: &'static str,
    pub pid: u32,
}

pub fn status() -> LocalStatus {
    LocalStatus {
        service: "colabd",
        version: env!("CARGO_PKG_VERSION"),
        pid: std::process::id(),
    }
}
