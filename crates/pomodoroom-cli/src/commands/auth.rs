use clap::Subcommand;

#[derive(Subcommand)]
pub enum AuthAction {
    /// Google: login / logout / status
    Google {
        #[command(subcommand)]
        action: AuthOp,
    },
    /// Notion: login / logout / status
    Notion {
        #[command(subcommand)]
        action: AuthOp,
    },
    /// Linear: login / logout / status
    Linear {
        #[command(subcommand)]
        action: AuthOp,
    },
    /// GitHub: login / logout / status
    Github {
        #[command(subcommand)]
        action: AuthOp,
    },
    /// Discord: login / logout / status
    Discord {
        #[command(subcommand)]
        action: AuthOp,
    },
    /// Slack: login / logout / status
    Slack {
        #[command(subcommand)]
        action: AuthOp,
    },
}

#[derive(Subcommand)]
pub enum AuthOp {
    /// Authenticate with the service
    Login {
        /// API token or credential (for services that use API keys)
        #[arg(long)]
        token: Option<String>,
        /// Client ID (for OAuth services like Google)
        #[arg(long)]
        client_id: Option<String>,
        /// Client secret (for OAuth services like Google)
        #[arg(long)]
        client_secret: Option<String>,
        /// Database ID (for Notion)
        #[arg(long)]
        database_id: Option<String>,
        /// Webhook URL (for Discord)
        #[arg(long)]
        webhook_url: Option<String>,
    },
    /// Remove credentials
    Logout,
    /// Check authentication status
    Status,
}

pub fn run(action: AuthAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        AuthAction::Google { action: op } => handle_google(op),
        AuthAction::Notion { action: op } => handle_notion(op),
        AuthAction::Linear { action: op } => handle_linear(op),
        AuthAction::Github { action: op } => handle_github(op),
        AuthAction::Discord { action: op } => handle_discord(op),
        AuthAction::Slack { action: op } => handle_slack(op),
    }
}

fn handle_google(op: AuthOp) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{google::GoogleIntegration, Integration};
    match op {
        AuthOp::Login {
            client_id,
            client_secret,
            ..
        } => {
            let cid = client_id.ok_or("--client-id required for Google")?;
            let csec = client_secret.ok_or("--client-secret required for Google")?;
            GoogleIntegration::set_credentials(&cid, &csec)?;
            let mut g = GoogleIntegration::new();
            g.authenticate()?;
            println!("Google authenticated");
        }
        AuthOp::Logout => {
            let mut g = GoogleIntegration::new();
            g.disconnect()?;
            println!("Google disconnected");
        }
        AuthOp::Status => {
            let g = GoogleIntegration::new();
            println!(
                "{}",
                if g.is_authenticated() {
                    "authenticated"
                } else {
                    "not authenticated"
                }
            );
        }
    }
    Ok(())
}

fn handle_notion(op: AuthOp) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{notion::NotionIntegration, Integration};
    match op {
        AuthOp::Login {
            token, database_id, ..
        } => {
            let tok = token.ok_or("--token required for Notion")?;
            let db_id = database_id.ok_or("--database-id required for Notion")?;
            let mut n = NotionIntegration::new();
            n.set_credentials(&tok, &db_id)?;
            n.authenticate()?;
            println!("Notion authenticated");
        }
        AuthOp::Logout => {
            let mut n = NotionIntegration::new();
            n.disconnect()?;
            println!("Notion disconnected");
        }
        AuthOp::Status => {
            let n = NotionIntegration::new();
            println!(
                "{}",
                if n.is_authenticated() {
                    "authenticated"
                } else {
                    "not authenticated"
                }
            );
        }
    }
    Ok(())
}

fn handle_linear(op: AuthOp) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{linear::LinearIntegration, Integration};
    match op {
        AuthOp::Login { token, .. } => {
            let tok = token.ok_or("--token required for Linear")?;
            let mut l = LinearIntegration::new();
            l.set_credentials(&tok)?;
            l.authenticate()?;
            println!("Linear authenticated");
        }
        AuthOp::Logout => {
            let mut l = LinearIntegration::new();
            l.disconnect()?;
            println!("Linear disconnected");
        }
        AuthOp::Status => {
            let l = LinearIntegration::new();
            println!(
                "{}",
                if l.is_authenticated() {
                    "authenticated"
                } else {
                    "not authenticated"
                }
            );
        }
    }
    Ok(())
}

fn handle_github(op: AuthOp) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{github::GitHubIntegration, Integration};
    match op {
        AuthOp::Login { token, .. } => {
            let tok = token.ok_or("--token required for GitHub")?;
            let mut g = GitHubIntegration::new();
            g.set_credentials(&tok)?;
            g.authenticate()?;
            println!("GitHub authenticated");
        }
        AuthOp::Logout => {
            let mut g = GitHubIntegration::new();
            g.disconnect()?;
            println!("GitHub disconnected");
        }
        AuthOp::Status => {
            let g = GitHubIntegration::new();
            println!(
                "{}",
                if g.is_authenticated() {
                    "authenticated"
                } else {
                    "not authenticated"
                }
            );
        }
    }
    Ok(())
}

fn handle_discord(op: AuthOp) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{discord::DiscordIntegration, Integration};
    match op {
        AuthOp::Login { webhook_url, .. } => {
            let url = webhook_url.ok_or("--webhook-url required for Discord")?;
            let mut d = DiscordIntegration::new();
            d.set_credentials(&url)?;
            d.authenticate()?;
            println!("Discord configured");
        }
        AuthOp::Logout => {
            let mut d = DiscordIntegration::new();
            d.disconnect()?;
            println!("Discord disconnected");
        }
        AuthOp::Status => {
            let d = DiscordIntegration::new();
            println!(
                "{}",
                if d.is_authenticated() {
                    "configured"
                } else {
                    "not configured"
                }
            );
        }
    }
    Ok(())
}

fn handle_slack(op: AuthOp) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{slack::SlackIntegration, Integration};
    match op {
        AuthOp::Login { token, .. } => {
            let tok = token.ok_or("--token required for Slack")?;
            let mut s = SlackIntegration::new();
            s.set_credentials(&tok)?;
            s.authenticate()?;
            println!("Slack authenticated");
        }
        AuthOp::Logout => {
            let mut s = SlackIntegration::new();
            s.disconnect()?;
            println!("Slack disconnected");
        }
        AuthOp::Status => {
            let s = SlackIntegration::new();
            println!(
                "{}",
                if s.is_authenticated() {
                    "authenticated"
                } else {
                    "not authenticated"
                }
            );
        }
    }
    Ok(())
}
