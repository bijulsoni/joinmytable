'use client';

// Interactive invite-codes table. Each row is clickable; expanding it
// reveals that code's share kit (sign-up link + the three channel
// messages with copy buttons) so the admin can re-copy and re-share an
// existing code without re-minting.
//
// Date/usage strings are pre-formatted on the server and passed in, so
// there's no client/server locale or timezone hydration mismatch.

import { useState } from 'react';
import { ShareMessages } from './ShareMessages';
import shared from '../styles.module.css';
import styles from './styles.module.css';

export interface InviteRow {
  id: string;
  code: string;
  note: string | null;
  usesLabel: string;
  expiresText: string;
  expiresExpired: boolean;
  createdText: string;
}

export function InviteCodesTable({ rows }: { rows: InviteRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className={shared.tableWrap}>
      <table className={shared.table}>
        <thead>
          <tr>
            <th aria-label="Expand" />
            <th>Code</th>
            <th>Channel</th>
            <th>Uses</th>
            <th>Expires</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const open = openId === c.id;
            return (
              <FragmentRow
                key={c.id}
                row={c}
                open={open}
                onToggle={() => setOpenId(open ? null : c.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({
  row,
  open,
  onToggle,
}: {
  row: InviteRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={styles.codeRow}
        onClick={onToggle}
        aria-expanded={open}
        title="Click to view & copy share messages"
      >
        <td aria-hidden className={styles.expandCell}>
          <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>›</span>
        </td>
        <td>
          <span className={shared.pill}>{row.code}</span>
        </td>
        <td>{row.note ? row.note : '—'}</td>
        <td>{row.usesLabel}</td>
        <td>
          {row.expiresExpired ? (
            <span className={`${shared.pill} ${shared.pillWarn}`}>{row.expiresText}</span>
          ) : (
            row.expiresText
          )}
        </td>
        <td>{row.createdText}</td>
      </tr>
      {open ? (
        <tr className={styles.expandedRow}>
          <td colSpan={6}>
            <ShareMessages code={row.code} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
