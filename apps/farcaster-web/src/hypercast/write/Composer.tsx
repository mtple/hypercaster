import cn from 'classnames';
import { FC, FormEvent, memo, useCallback, useState } from 'react';

import { DefaultButton } from '~/components/forms/buttons/DefaultButton';
import { DefaultModalContainer } from '~/components/modals/DefaultModalContainer';
import { DefaultModalContent } from '~/components/modals/DefaultModalContent';
import { DefaultModalHeader } from '~/components/modals/DefaultModalHeader';
import { Modal } from '~/components/modals/Modal';
import type { ComposerTarget } from '~/hypercast/write/WriteContext';
import { api } from '~/hypersnap/client';
import { isNotFound } from '~/hypersnap/errors';
import { handleOf } from '~/hypersnap/normalize';
import type { Fid } from '~/hypersnap/types';
import {
  byteLength,
  extractMentions,
  linkEmbedsOf,
  mentionCandidates,
} from '~/hypersnap/writes/castText';
import { isWriteError } from '~/hypersnap/writes/errors';
import { type CastDraft, MAX_CAST_BYTES } from '~/hypersnap/writes/messages';

/** While a request is in flight the dialog cannot be dismissed. */
const ignore = () => undefined;

type ComposerProps = {
  target: ComposerTarget;
  onClose: () => void;
  /** Sends the cast; resolves once the node has accepted it. */
  onSend: (draft: CastDraft) => Promise<void>;
};

/** Looks up each "@name" typed; names that are not accounts stay as text. */
async function resolveMentions(text: string): Promise<Map<string, Fid>> {
  const resolved = new Map<string, Fid>();
  await Promise.all(
    mentionCandidates(text).map(async (name) => {
      try {
        resolved.set(name, (await api.getUserByUsername(name)).fid);
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    }),
  );
  return resolved;
}

async function draftFrom(
  input: string,
  target: ComposerTarget,
): Promise<CastDraft> {
  const text = input.trim();
  const prepared = extractMentions(text, await resolveMentions(text));
  return {
    ...prepared,
    embeds: linkEmbedsOf(prepared.text).map((url) => ({ url })),
    ...(target.parent
      ? { parent: { fid: target.parent.author.fid, hash: target.parent.hash } }
      : target.channel?.url
        ? { parentUrl: target.channel.url }
        : {}),
  };
}

const Composer: FC<ComposerProps> = memo(({ target, onClose, onSend }) => {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const used = byteLength(text.trim());
  const remaining = MAX_CAST_BYTES - used;
  const canSend = used > 0 && remaining >= 0 && !isSending;

  const send = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (!canSend) {
        return;
      }
      setIsSending(true);
      setProblem(null);
      try {
        await onSend(await draftFrom(text, target));
        onClose();
      } catch (error) {
        setProblem(
          isWriteError(error)
            ? error.message
            : 'This could not be sent. Check your connection and try again.',
        );
        setIsSending(false);
      }
    },
    [canSend, onClose, onSend, target, text],
  );

  const title = target.parent
    ? 'Reply'
    : target.channel
      ? `Cast in /${target.channel.id}`
      : 'New cast';

  return (
    <Modal>
      <DefaultModalContainer onClose={isSending ? ignore : onClose}>
        <DefaultModalContent minHeightPx={0}>
          <DefaultModalHeader title={title} onClose={onClose} />
          <form
            className="flex w-full flex-col gap-3 px-4 pb-4"
            onSubmit={send}
          >
            {target.parent && (
              <div className="rounded-lg border p-3 text-sm border-default">
                <div className="text-muted">
                  Replying to{' '}
                  <span className="font-semibold text-default">
                    {handleOf(target.parent.author)}
                  </span>
                </div>
                <div className="line-clamp-3 pt-1 text-default [overflow-wrap:anywhere]">
                  {target.parent.text}
                </div>
              </div>
            )}
            <label className="sr-only" htmlFor="hypercast-composer">
              {target.parent ? 'Your reply' : 'Your cast'}
            </label>
            <textarea
              id="hypercast-composer"
              autoFocus
              rows={5}
              value={text}
              disabled={isSending}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  void send();
                }
              }}
              placeholder={
                target.parent ? 'Write a reply' : 'What’s happening?'
              }
              className="w-full resize-none rounded border bg-input p-2 text-base border-default text-default"
            />
            <div className="flex flex-row items-center justify-between gap-3">
              <span
                className={cn(
                  'text-sm',
                  remaining < 0 ? 'text-danger' : 'text-faint',
                )}
                aria-live="polite"
              >
                {remaining < 0
                  ? `${-remaining} over the limit`
                  : remaining <= 100
                    ? `${remaining} left`
                    : ''}
              </span>
              <DefaultButton
                type="submit"
                className="h-10 min-w-[96px]"
                isLoading={isSending}
                disabled={!canSend}
              >
                {target.parent ? 'Reply' : 'Cast'}
              </DefaultButton>
            </div>
            {problem && (
              <div role="alert" className="text-sm text-danger">
                {problem}
              </div>
            )}
          </form>
        </DefaultModalContent>
      </DefaultModalContainer>
    </Modal>
  );
});
Composer.displayName = 'Composer';

export { Composer, draftFrom };
