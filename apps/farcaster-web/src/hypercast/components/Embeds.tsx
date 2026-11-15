import cn from 'classnames';
import { LinkIcon, PlayIcon } from 'lucide-react';
import { FC, memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ImageLightboxModal } from '~/components/modals/ImageLightboxModal';
import { Avatar, AVATAR_SIZES } from '~/hypercast/components/Avatar';
import { exactTime, timeAgo } from '~/hypercast/format';
import { paths } from '~/hypercast/paths';
import { displayLink } from '~/hypercast/text';
import { config } from '~/hypersnap/config';
import type { CastContext } from '~/hypersnap/hooks';
import { handleOf } from '~/hypersnap/normalize';
import type { Cast, Embed } from '~/hypersnap/types';

type EmbedVariant = 'feed' | 'focused' | 'quote';

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

const externalLinkProps = {
  target: '_blank',
  rel: 'noopener noreferrer nofollow ugc',
  referrerPolicy: 'no-referrer',
} as const;

// --- images ---------------------------------------------------------------

type ImageEmbedProps = {
  url: string;
  height: number;
  fixedHeight: boolean;
  onOpen: () => void;
};

const ImageEmbed: FC<ImageEmbedProps> = memo(
  ({ url, height, fixedHeight, onOpen }) => {
    const [failed, setFailed] = useState(false);

    if (failed) {
      return (
        <a
          href={url}
          {...externalLinkProps}
          onClick={stop}
          className="flex shrink-0 items-center justify-center rounded-[12px] border px-4 text-sm bg-elevated border-default text-faint hover:underline"
          style={{ height: Math.min(height, 120), minWidth: 180 }}
        >
          Image failed to load
        </a>
      );
    }

    return (
      <img
        src={url}
        alt="Cast image embed"
        loading="lazy"
        draggable={false}
        referrerPolicy="no-referrer"
        className="relative max-w-full cursor-pointer rounded-[12px] border object-cover object-left bg-elevated border-default"
        style={{ maxHeight: height, height: fixedHeight ? height : undefined }}
        onError={() => setFailed(true)}
        onMouseDown={stop}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      />
    );
  },
);
ImageEmbed.displayName = 'ImageEmbed';

// --- video ----------------------------------------------------------------

let nativeHlsSupport: boolean | null = null;

/** Safari plays HLS natively; other browsers need a player library. */
function canPlayHlsNatively(): boolean {
  if (nativeHlsSupport === null) {
    nativeHlsSupport =
      typeof document !== 'undefined' &&
      document
        .createElement('video')
        .canPlayType('application/vnd.apple.mpegurl') !== '';
  }
  return nativeHlsSupport;
}

const VideoLink: FC<{ url: string; note: string }> = memo(({ url, note }) => (
  <a
    href={url}
    {...externalLinkProps}
    onClick={stop}
    onMouseDown={stop}
    className="flex w-full flex-row items-center gap-3 rounded-[12px] border px-3 py-2 !text-inherit border-default hover:bg-overlay-faint"
  >
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-secondary">
      <PlayIcon size={16} aria-hidden="true" />
    </span>
    <span className="flex min-w-0 flex-col">
      <span className="text-sm font-semibold text-default">Video</span>
      <span className="truncate text-sm text-faint">{note}</span>
    </span>
  </a>
));
VideoLink.displayName = 'VideoLink';

const VideoEmbed: FC<{
  embed: Extract<Embed, { kind: 'video' }>;
  height: number;
}> = memo(({ embed, height }) => {
  const [failed, setFailed] = useState(false);

  if (embed.streaming && !canPlayHlsNatively()) {
    return (
      <VideoLink
        url={embed.url}
        note="Streaming video — opens in a new tab in this browser"
      />
    );
  }
  if (failed) {
    return (
      <VideoLink url={embed.url} note="This video could not be played here" />
    );
  }

  return (
    <video
      src={embed.url}
      controls
      playsInline
      preload="metadata"
      className="max-w-full rounded-[12px] border bg-black border-default"
      style={{ maxHeight: height }}
      onError={() => setFailed(true)}
      onClick={stop}
      onMouseDown={stop}
    />
  );
});
VideoEmbed.displayName = 'VideoEmbed';

// --- links ----------------------------------------------------------------

/**
 * The node has no page metadata to offer, so a link is shown as what it
 * is: a host and an address. No preview is fetched from anywhere.
 */
const LinkEmbed: FC<{ embed: Extract<Embed, { kind: 'link' }> }> = memo(
  ({ embed }) => (
    <a
      href={embed.url}
      title={embed.url}
      {...externalLinkProps}
      onClick={stop}
      onMouseDown={stop}
      className="flex w-full flex-row items-center gap-3 rounded-[12px] border px-3 py-2 !text-inherit border-default hover:bg-overlay-faint"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-secondary">
        <LinkIcon size={16} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-default">
          {embed.host}
        </span>
        <span className="truncate text-sm text-faint">
          {displayLink(embed.url, 64)}
        </span>
      </span>
    </a>
  ),
);
LinkEmbed.displayName = 'LinkEmbed';

// --- quoted casts ---------------------------------------------------------

const QuoteCast: FC<{ cast: Cast | undefined }> = memo(({ cast }) => {
  if (!cast) {
    return (
      <div className="rounded-[12px] border px-3 py-3 text-sm border-default text-faint">
        The quoted cast is not available on {config.nodeLabel}.
      </div>
    );
  }

  const images = cast.embeds.filter(
    (embed): embed is Extract<Embed, { kind: 'image' }> =>
      embed.kind === 'image',
  );

  return (
    <div className="relative flex w-full flex-col rounded-[12px] border pt-2 border-default hover:bg-[#0000000d] dark:hover:bg-[#ffffff0d]">
      <div className="flex flex-row items-center space-x-1 px-3">
        <Avatar
          user={cast.author}
          size="xs"
          disabled
          className="relative h-[20px] shrink-0"
        />
        <div className="flex min-w-0 flex-1 shrink flex-row items-center gap-1">
          <span className="truncate font-semibold text-default">
            {handleOf(cast.author).replace('@', '')}
          </span>
          <span
            className="shrink-0 text-base text-faint"
            title={exactTime(cast.timestampMs)}
          >
            {timeAgo(cast.timestampMs)}
          </span>
        </div>
      </div>
      <div
        className={cn(
          'mt-2 break-words px-3 text-base leading-5 tracking-normal',
          cast.text === '' ? 'text-faint' : 'text-default',
          images.length === 0 && 'pb-3',
        )}
      >
        <div className="line-clamp-5 whitespace-pre-wrap">
          {cast.text === '' ? 'Show more...' : cast.text}
        </div>
      </div>
      {images.length !== 0 && (
        <div className="scrollbar-hide m-3 flex flex-row gap-2 overflow-x-auto">
          {images.map((image) => (
            <img
              key={image.url}
              src={image.url}
              alt="Quoted cast image embed"
              loading="lazy"
              draggable={false}
              referrerPolicy="no-referrer"
              className="max-h-[160px] max-w-full rounded-lg border object-cover border-default"
            />
          ))}
        </div>
      )}
      <Link
        to={paths.cast(cast)}
        title={`Cast by ${handleOf(cast.author)}`}
        className="absolute inset-0"
        onClick={stop}
        onMouseDown={stop}
      />
    </div>
  );
});
QuoteCast.displayName = 'QuoteCast';

// --- layout ---------------------------------------------------------------

type EmbedsProps = {
  cast: Cast;
  context: CastContext;
  variant: EmbedVariant;
};

const Embeds: FC<EmbedsProps> = memo(({ cast, context, variant }) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { images, videos, links, quotes } = useMemo(() => {
    const grouped = {
      images: [] as Extract<Embed, { kind: 'image' }>[],
      videos: [] as Extract<Embed, { kind: 'video' }>[],
      links: [] as Extract<Embed, { kind: 'link' }>[],
      quotes: [] as Extract<Embed, { kind: 'cast' }>[],
    };
    for (const embed of cast.embeds) {
      if (embed.kind === 'image') {
        grouped.images.push(embed);
      } else if (embed.kind === 'video') {
        grouped.videos.push(embed);
      } else if (embed.kind === 'link') {
        grouped.links.push(embed);
      } else {
        grouped.quotes.push(embed);
      }
    }
    return grouped;
  }, [cast.embeds]);

  const imageUrls = useMemo(() => images.map((image) => image.url), [images]);

  if (cast.embeds.length === 0) {
    return null;
  }

  const playable = videos.filter(
    (video) => !video.streaming || canPlayHlsNatively(),
  );
  const linkedVideos = videos.filter((video) => !playable.includes(video));
  const mediaCount = images.length + playable.length;
  const isCarousel = mediaCount > 1;
  const mediaHeight = isCarousel ? 260 : variant === 'focused' ? 520 : 400;
  const hasStacked = quotes.length + links.length + linkedVideos.length > 0;

  const media = mediaCount > 0 && (
    <>
      {images.map((image, index) => (
        <ImageEmbed
          key={image.url}
          url={image.url}
          height={mediaHeight}
          fixedHeight={isCarousel}
          onOpen={() => setLightboxIndex(index)}
        />
      ))}
      {playable.map((video) => (
        <VideoEmbed key={video.url} embed={video} height={mediaHeight} />
      ))}
    </>
  );

  const stacked = hasStacked && (
    <>
      {quotes.map((quote) => (
        <QuoteCast key={quote.hash} cast={context.quoted[quote.hash]} />
      ))}
      {linkedVideos.map((video) => (
        <VideoEmbed key={video.url} embed={video} height={mediaHeight} />
      ))}
      {links.map((link) => (
        <LinkEmbed key={link.url} embed={link} />
      ))}
    </>
  );

  // A lone image or video may not be wider than the space beside the
  // avatar column; a carousel scrolls sideways instead.
  const mediaRow = isCarousel ? (
    media
  ) : (
    <div className="flex min-w-0 flex-1">{media}</div>
  );

  const scrollClasses = isCarousel
    ? 'overflow-x-auto overflow-y-hidden'
    : 'overflow-x-hidden overflow-y-hidden';

  return (
    <>
      {variant === 'focused' ? (
        <>
          {media && (
            <div
              className={cn(
                'scrollbar-hide flex w-full flex-row gap-2 pr-3',
                scrollClasses,
              )}
            >
              <div style={{ width: 6, minWidth: 6 }} />
              {mediaRow}
              <div style={{ width: 6, minWidth: 6 }} />
            </div>
          )}
          {stacked && (
            <div
              className={cn(
                'ml-3 flex w-full flex-row items-center',
                media && 'mt-3',
              )}
            >
              <div className="mr-3 flex w-full flex-col gap-2 overflow-hidden">
                {stacked}
              </div>
              <div style={{ width: 12, minWidth: 12 }} />
            </div>
          )}
        </>
      ) : (
        <>
          {media && (
            <div
              className={cn(
                'scrollbar-hide mt-3 flex w-full select-none flex-row gap-2 pr-4',
                scrollClasses,
              )}
            >
              <div
                style={{
                  width: AVATAR_SIZES.md + 16,
                  minWidth: AVATAR_SIZES.md + 16,
                }}
              />
              {mediaRow}
            </div>
          )}
          {stacked && (
            <div className="flex w-full flex-row items-center">
              <div
                style={{
                  width: AVATAR_SIZES.md + 24,
                  minWidth: AVATAR_SIZES.md + 24,
                }}
              />
              <div className="mr-4 mt-3 flex w-full flex-col gap-2 overflow-hidden">
                {stacked}
              </div>
            </div>
          )}
        </>
      )}
      {lightboxIndex !== null && imageUrls.length > 0 && (
        <ImageLightboxModal
          title="Cast image"
          imageUrls={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
});

Embeds.displayName = 'Embeds';

export { Embeds };
