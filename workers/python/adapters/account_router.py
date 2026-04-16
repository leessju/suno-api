"""
Account Router — gem_credit_snapshots에서 최적 계정 선택
"""

import logging
import sqlite3
import time

logger = logging.getLogger('adapters.account_router')


def get_best_account(db_path: str) -> dict:
    """
    gem_credit_snapshots에서 credits가 가장 높은 계정 반환.
    테이블이 비어있거나 모든 credits=0이면 account_id=1 fallback.
    반환: {"account_id": int, "label": str, "credits": int}
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            """
            SELECT account_id, label, credits
            FROM gem_credit_snapshots
            WHERE credits > 0
            ORDER BY credits DESC
            LIMIT 1
            """
        ).fetchone()

        if row:
            result = {"account_id": row["account_id"], "label": row["label"] or "", "credits": row["credits"]}
            logger.info(f"최적 계정 선택: account_id={result['account_id']}, credits={result['credits']}")
            return result

        # fallback: credits > 0인 행 없음
        logger.warning("gem_credit_snapshots에 유효한 계정 없음 → account_id=1 fallback")
        return {"account_id": 1, "label": "", "credits": 0}
    finally:
        conn.close()


def deduct_credits(db_path: str, account_id: int, amount: int = 10):
    """
    credits 차감 (낙관적 업데이트).
    credits < amount이면 0으로 설정.
    """
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            UPDATE gem_credit_snapshots
            SET credits = MAX(0, credits - ?), updated_at = ?
            WHERE account_id = ?
            """,
            (amount, int(time.time() * 1000), account_id)
        )
        conn.commit()
        logger.info(f"크레딧 차감: account_id={account_id}, amount={amount}")
    finally:
        conn.close()


def refresh_credits(db_path: str, account_id: int, credits: int, label: str = None):
    """
    크레딧 갱신 (upsert).
    """
    conn = sqlite3.connect(db_path)
    try:
        now = int(time.time() * 1000)
        conn.execute(
            """
            INSERT INTO gem_credit_snapshots (account_id, label, credits, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
                credits = excluded.credits,
                updated_at = excluded.updated_at,
                label = COALESCE(excluded.label, gem_credit_snapshots.label)
            """,
            (account_id, label, credits, now)
        )
        conn.commit()
        logger.info(f"크레딧 갱신: account_id={account_id}, credits={credits}")
    finally:
        conn.close()
