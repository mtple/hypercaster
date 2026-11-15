import { createApi } from '~/hypersnap/api';
import { config } from '~/hypersnap/config';
import { createTransport } from '~/hypersnap/http';

/** The app-wide transport and read API, bound to the configured node. */
const transport = createTransport(config);
const api = createApi(transport);

export { api, transport };
