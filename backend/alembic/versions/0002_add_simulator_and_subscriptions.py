"""add simulator and subscriptions

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-30 13:48:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')


def upgrade() -> None:
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('vendor_name', sa.String(length=120), nullable=False),
        sa.Column('vendor_id', sa.Uuid(), nullable=True),
        sa.Column('plan_name', sa.String(length=120), nullable=False, server_default='Standard'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('billing_frequency', sa.String(length=20), nullable=False, server_default='monthly'),
        sa.Column('recurring_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('currency', sa.String(length=10), nullable=False, server_default='USD'),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('next_renewal_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trial_start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trial_expiry_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancellation_notice_hours', sa.Integer(), nullable=False, server_default='24'),
        sa.Column('subscription_expiry_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reminders', json_type, nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('policy_snapshot_id', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['policy_snapshot_id'], ['policy_snapshots.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_subscriptions_vendor_name'), 'subscriptions', ['vendor_name'], unique=False)
    op.create_index(op.f('ix_subscriptions_status'), 'subscriptions', ['status'], unique=False)
    op.create_index(op.f('ix_subscriptions_created_at'), 'subscriptions', ['created_at'], unique=False)

    op.create_table(
        'simulator_scenarios',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('investigation_id', sa.Uuid(), nullable=True),
        sa.Column('vendor_id', sa.Uuid(), nullable=True),
        sa.Column('vendor_name', sa.String(length=120), nullable=False),
        sa.Column('inputs', json_type, nullable=False),
        sa.Column('results', json_type, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['investigation_id'], ['investigations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_simulator_scenarios_created_at'), 'simulator_scenarios', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_table('simulator_scenarios')
    op.drop_table('subscriptions')
