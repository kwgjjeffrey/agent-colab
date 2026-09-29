use anyhow::Context;
use async_trait::async_trait;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use minijinja::{Environment, context};

pub struct OrganizationInvite<'a> {
    pub to: &'a str,
    pub organization: &'a str,
    pub inviter: &'a str,
    pub accept_url: &'a str,
}

#[async_trait]
pub trait EmailSender: Send + Sync {
    async fn send_organization_invite(&self, invite: OrganizationInvite<'_>) -> anyhow::Result<()>;
}

pub struct SmtpEmailSender {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: String,
}

pub struct CloudflareEmailSender {
    http: reqwest::Client,
    account_id: String,
    api_token: String,
    from: String,
}

impl CloudflareEmailSender {
    pub fn new(account_id: String, api_token: String, from: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            account_id,
            api_token,
            from,
        }
    }
}

#[async_trait]
impl EmailSender for CloudflareEmailSender {
    async fn send_organization_invite(&self, invite: OrganizationInvite<'_>) -> anyhow::Result<()> {
        let (text, html) = render_invite(&invite)?;
        let response = self.http.post(format!("https://api.cloudflare.com/client/v4/accounts/{}/email/sending/send", self.account_id))
            .bearer_auth(&self.api_token)
            .json(&serde_json::json!({"from":self.from,"to":[invite.to],"subject":format!("Join {} on Colab",invite.organization),"text":text,"html":html}))
            .send().await.context("call Cloudflare Email Sending")?;
        if !response.status().is_success() {
            anyhow::bail!(
                "Cloudflare Email Sending returned {}: {}",
                response.status(),
                response.text().await.unwrap_or_default()
            );
        }
        Ok(())
    }
}
impl SmtpEmailSender {
    pub fn from_url(smtp_url: &str, from: String) -> anyhow::Result<Self> {
        let transport = AsyncSmtpTransport::<Tokio1Executor>::from_url(smtp_url)?.build();
        Ok(Self { transport, from })
    }
}

#[async_trait]
impl EmailSender for SmtpEmailSender {
    async fn send_organization_invite(&self, invite: OrganizationInvite<'_>) -> anyhow::Result<()> {
        let (text, html) = render_invite(&invite)?;
        let message = Message::builder()
            .from(self.from.parse()?)
            .to(invite.to.parse()?)
            .subject(format!("Join {} on Colab", invite.organization))
            .multipart(lettre::message::MultiPart::alternative_plain_html(
                text, html,
            ))?;
        self.transport
            .send(message)
            .await
            .context("send organization invitation")?;
        Ok(())
    }
}

fn render_invite(invite: &OrganizationInvite<'_>) -> anyhow::Result<(String, String)> {
    let mut env = Environment::new();
    env.add_template(
        "html",
        include_str!("../templates/organization-invite.html"),
    )?;
    env.add_template("text", include_str!("../templates/organization-invite.txt"))?;
    let data = context!(organization=>invite.organization,inviter=>invite.inviter,accept_url=>invite.accept_url);
    let html = env.get_template("html")?.render(&data)?;
    let text = env.get_template("text")?.render(&data)?;
    Ok((text, html))
}
