import cx from 'clsx';
import { CloseIcon } from './Icons.tsx';

export type NoticeKind = 'error' | 'info' | 'success';

export interface NoticeState {
  kind: NoticeKind;
  message: string;
}

const noticeClassNames: Record<NoticeKind, string> = {
  error: 'notice-error',
  info: 'notice-info',
  success: 'notice-success',
};

interface NoticeProps {
  notice: NoticeState;
  onDismiss?: () => void;
}

export const Notice = ({ notice, onDismiss }: NoticeProps) => (
  <div
    className={cx('notice', noticeClassNames[notice.kind])}
    role={notice.kind === 'error' ? 'alert' : 'status'}
  >
    <span className="notice-dot" />
    <p className="notice-message">{notice.message}</p>
    {onDismiss ? (
      <button
        aria-label="通知を閉じる"
        className="notice-dismiss"
        onClick={onDismiss}
        type="button"
      >
        <CloseIcon height="14" width="14" />
      </button>
    ) : null}
  </div>
);
