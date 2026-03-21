"""
Slack Notifier — composes and posts a rich Block Kit incident alert to #incidents.
Supports both real Slack API and a dry-run mode when no token is configured.
"""
import logging
from typing import Any

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from agent.config import settings

logger = logging.getLogger(__name__)


def _get_severity_emoji(severity: str) -> str:
    return {
        "SEV1_CRITICAL": "🔴",
        "SEV2_HIGH": "🟠",
        "SEV3_LOW": "🟡",
    }.get(severity, "⚪")


def build_incident_blocks(
    incident_id: str,
    severity: str,
    affected_service: str,
    confidence: float | None,
    root_cause: str,
    causal_commit: str | None,
    causal_repo: str | None,
    five_whys: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build the Slack Block Kit payload for an incident alert."""
    emoji = _get_severity_emoji(severity)
    confidence_str = f"{confidence * 100:.0f}%" if confidence else "N/A"
    commit_str = f"`{causal_commit[:8]}`" if causal_commit else "Not identified"
    repo_str = causal_repo or "Not identified"

    # Five Whys — show first 2 for brevity; full RCA is in the dashboard
    whys_text = ""
    for w in five_whys[:2]:
        whys_text += f"*{w.get('why')}. {w.get('question')}*\n> {w.get('answer')}\n"
    if len(five_whys) > 2:
        whys_text += f"_...and {len(five_whys) - 2} more. See dashboard for full RCA._"

    return [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"{emoji} {severity} — {affected_service}",
            },
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Service:*\n`{affected_service}`"},
                {"type": "mrkdwn", "text": f"*Severity:*\n{severity}"},
                {"type": "mrkdwn", "text": f"*AI Confidence:*\n{confidence_str}"},
                {"type": "mrkdwn", "text": f"*Causal Commit:*\n{commit_str}"},
            ],
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*📋 Root Cause:*\n{root_cause}",
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*🔍 5 Whys (excerpt):*\n{whys_text}",
            },
        },
        {"type": "divider"},
        {
            "type": "actions",
            "block_id": f"incident_actions_{incident_id}",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "✅ Approve Rollback"},
                    "style": "primary",
                    "action_id": "approve_rollback",
                    "value": incident_id,
                    "confirm": {
                        "title": {"type": "plain_text", "text": "Confirm Rollback"},
                        "text": {"type": "mrkdwn", "text": "This will initiate an automated rollback. Are you sure?"},
                        "confirm": {"type": "plain_text", "text": "Yes, Rollback"},
                        "deny": {"type": "plain_text", "text": "Cancel"},
                    },
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "📋 Create Jira"},
                    "action_id": "create_jira",
                    "value": incident_id,
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "🔕 Dismiss"},
                    "style": "danger",
                    "action_id": "dismiss",
                    "value": incident_id,
                },
            ],
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"Incident ID: `{incident_id}` | Causal Repo: `{repo_str}` | SentinelOps v1.0",
                }
            ],
        },
    ]


async def send_incident_alert(
    incident_id: str,
    severity: str,
    affected_service: str,
    confidence: float | None,
    root_cause: str,
    causal_commit: str | None,
    causal_repo: str | None,
    five_whys: list[dict[str, Any]],
) -> str | None:
    """
    Post a Block Kit incident alert to the configured Slack channel.
    Returns the message timestamp (ts) for future updates.
    Returns None in dry-run (no token configured) mode.
    """
    blocks = build_incident_blocks(
        incident_id=incident_id,
        severity=severity,
        affected_service=affected_service,
        confidence=confidence,
        root_cause=root_cause,
        causal_commit=causal_commit,
        causal_repo=causal_repo,
        five_whys=five_whys,
    )

    if not settings.slack_bot_token:
        logger.warning(
            "SLACK_BOT_TOKEN not set — Slack alert suppressed (dry-run mode). "
            "Set the token in .env to enable real Slack notifications."
        )
        logger.info(f"[DRY-RUN] Would post to {settings.slack_incident_channel}:\n{root_cause}")
        return None

    try:
        client = WebClient(token=settings.slack_bot_token)
        response = client.chat_postMessage(
            channel=settings.slack_incident_channel,
            text=f"{_get_severity_emoji(severity)} *{severity}* on `{affected_service}` — RCA ready. Review required.",
            blocks=blocks,
        )
        ts = response["ts"]
        logger.info(f"✅ Slack alert posted (ts={ts}) to {settings.slack_incident_channel}")
        return ts

    except SlackApiError as e:
        logger.error(f"Slack API error: {e.response['error']} — alert not sent.")
        return None
