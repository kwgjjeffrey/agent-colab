use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub service: &'static str,
    pub version: &'static str,
}

pub fn status() -> ServiceStatus {
    ServiceStatus {
        service: "colab-server",
        version: env!("CARGO_PKG_VERSION"),
    }
}
