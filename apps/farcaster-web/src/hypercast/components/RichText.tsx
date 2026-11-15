import { FC, memo, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { paths } from '~/hypercast/paths';
import { displayLink, segmentText } from '~/hypercast/text';
import type { MentionSpan } from '~/hypersnap/types';

type RichTextProps = {
  text: string;
  mentions?: MentionSpan[];
};

const stop = (event: React.MouseEvent) => event.stopPropagation();

/**
 * Cast or bio text with mentions and links made clickable. Everything is
 * rendered as text nodes and anchors; no HTML from the network is ever
 * inserted into the page.
 */
const RichText: FC<RichTextProps> = memo(({ text, mentions }) => {
  const segments = useMemo(() => segmentText(text, mentions), [text, mentions]);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === 'mention') {
          return (
            <Link
              key={index}
              to={paths.profile({
                fid: segment.fid,
                username: segment.username,
              })}
              className="relative hover:underline"
              onClick={stop}
              onMouseDown={stop}
            >
              {segment.text}
            </Link>
          );
        }
        if (segment.kind === 'link') {
          return (
            <a
              key={index}
              href={segment.url}
              title={segment.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="relative hover:underline"
              onClick={stop}
              onMouseDown={stop}
            >
              {displayLink(segment.text)}
            </a>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </>
  );
});

RichText.displayName = 'RichText';

export { RichText };
