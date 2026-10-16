"""
Email
=====
Provider-agnostic transactional email over SMTP (works with Resend, SendGrid, Postmark,
Mailgun, Amazon SES, Gmail app passwords, ...).

EMAIL_BACKEND=smtp     send for real (needs SMTP_HOST and friends)
EMAIL_BACKEND=console  (default) don't send. With DEBUG=true the message is printed so you
                       can click links while developing. In production nothing is logged,
                       because the message contains one-time links.

Sending never raises into the request path: failures are logged without message content.
"""

import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from html import escape
from typing import Optional

from app.core.config import get_settings

settings = get_settings()


def email_enabled() -> bool:
    return settings.email_backend == "smtp" and bool(settings.smtp_host)


def _deliver_smtp(msg: EmailMessage) -> None:
    mode = settings.smtp_security
    if mode == "ssl":
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=ssl.create_default_context())
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
    with server:
        if mode == "starttls":
            server.starttls(context=ssl.create_default_context())
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


async def send_email(to: str, subject: str, text: str, html: Optional[str] = None) -> bool:
    """Returns True if handed to the SMTP server. Never raises."""
    msg = EmailMessage()
    msg["From"] = settings.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    if not email_enabled():
        if settings.debug:
            print(f"\n[email:console] To: {to}\nSubject: {subject}\n{text}\n")
        else:
            print(f"[email] not sent (EMAIL_BACKEND is not configured): {subject!r}")
        return False
    try:
        await asyncio.to_thread(_deliver_smtp, msg)
        return True
    except Exception as e:
        print(f"[email] delivery failed ({type(e).__name__}): {subject!r}")
        return False


# ─────────────────────────────────────────────
# TEMPLATES
# ─────────────────────────────────────────────

def _layout(heading: str, body: str, button_label: str, url: str, footer: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#f4f7fa;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0c1622">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #e1e7ee;border-radius:16px">
<tr><td style="padding:28px 32px 8px;font-size:22px;font-weight:800;letter-spacing:-0.03em">ERNIE</td></tr>
<tr><td style="padding:8px 32px 0"><h1 style="margin:0;font-size:20px;letter-spacing:-0.02em">{escape(heading)}</h1></td></tr>
<tr><td style="padding:12px 32px;font-size:15px;line-height:1.6;color:#3e4c5c">{body}</td></tr>
<tr><td style="padding:8px 32px 24px"><a href="{escape(url)}" style="display:inline-block;background:linear-gradient(135deg,#8ee02b,#0bb584);color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">{escape(button_label)}</a></td></tr>
<tr><td style="padding:0 32px 8px;font-size:12px;color:#66768a;line-height:1.6;word-break:break-all">Or paste this link into your browser:<br>{escape(url)}</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#66768a;line-height:1.6;border-top:1px solid #e1e7ee">{escape(footer)}</td></tr>
</table></td></tr></table></body></html>"""


def reset_email(link: str):
    text = (f"Reset your ERNIE password\n\nUse this link within 1 hour to choose a new password:\n{link}\n\n"
            "If you didn't ask for this, you can ignore this email. Your password won't change.")
    html = _layout("Reset your password", "Use the button below within 1 hour to choose a new password.",
                   "Choose a new password", link, "If you didn't request this, ignore this email. Your password won't change.")
    return "Reset your ERNIE password", text, html


def verify_email(link: str):
    text = f"Confirm your email for ERNIE\n\nConfirm this address to finish setting up your account:\n{link}\n\nThe link works for 48 hours."
    html = _layout("Confirm your email", "Confirm this address to finish setting up your ERNIE account. The link works for 48 hours.",
                   "Confirm email", link, "If you didn't create an ERNIE account, you can ignore this email.")
    return "Confirm your email for ERNIE", text, html


def invite_email(link: str, workspace: str, inviter: str, role: str):
    text = (f"{inviter} invited you to join {workspace} on ERNIE as {'an admin' if role == 'admin' else 'a member'}.\n\n"
            f"Accept the invitation (single use, expires in 7 days):\n{link}")
    html = _layout(f"Join {workspace} on ERNIE",
                   f"{escape(inviter)} invited you to join <b>{escape(workspace)}</b> as {'an admin' if role == 'admin' else 'a member'}. The link works once and expires in 7 days.",
                   "Accept invitation", link, "If you weren't expecting this invitation, you can ignore this email.")
    return f"You're invited to {workspace} on ERNIE", text, html
