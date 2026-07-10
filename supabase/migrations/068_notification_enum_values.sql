-- Migration 068: notification types for unblock/cancel approval flows
alter type notification_type add value if not exists 'block_rejected';
alter type notification_type add value if not exists 'unblock_request';
alter type notification_type add value if not exists 'cancel_request';
alter type notification_type add value if not exists 'cancel_approved';
alter type notification_type add value if not exists 'cancel_rejected';
