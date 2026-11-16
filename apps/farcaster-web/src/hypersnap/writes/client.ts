/**
 * The message poster for this build. Importing this file is what pulls
 * the ability to submit into a bundle, so only the write module does.
 */
import { config } from '~/hypersnap/config';
import { createMessagePoster } from '~/hypersnap/writes/poster';

const poster = createMessagePoster(config);

export { poster };
