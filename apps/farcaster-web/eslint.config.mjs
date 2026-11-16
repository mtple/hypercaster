import customConfig from 'eslint-config-custom/react';

const NOTION_RE = String.raw`/notion\.(?:so|site)/i`;

export default [
  ...customConfig,
  {
    files: ['**/*.config.js', '**/*.config.mjs', '**/.prettierrc.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      curly: 'error',
      'no-restricted-globals': ['error', 'reportError'],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'][left.object.type='MemberExpression'][left.object.object.name='window'][left.object.property.name='location'][left.property.name='href']",
          message:
            'Please use useExternalNavigate() instead to support proper navigation in the PWA mode.',
        },
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'][left.object.name='location'][left.property.name='href']",
          message:
            'Please use useExternalNavigate() instead to support proper navigation in the PWA mode.',
        },
        {
          selector: `Literal[value=${NOTION_RE}]`,
          message:
            'Use getNotionLink() helper instead of hard-coding Notion URLs.',
        },
        {
          selector: `TemplateElement[value.raw=${NOTION_RE}]`,
          message:
            'Use getNotionLink() helper instead of hard-coding Notion URLs.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'farcaster-client-hooks/src',
                'farcaster-client-hooks/src/**',
                '../../farcaster-client-hooks/src/**',
                '**/farcaster-client-hooks/src/**',
              ],
              message: 'Always import from farcaster-client-hooks.',
            },
            {
              group: ['../*'],
              message: 'Prefer absolute imports using the `~` alias.',
            },
            {
              group: ['~/pages/*'],
              message: 'Always import from ~/lazy/pages.',
            },
            {
              group: [
                './LoginQRCode',
                '~/components/login/LoginQRCode',
                '~/components/composer/Composer',
                './Composer',
              ],
              message: 'Please import from ~/lazy/components',
            },
            {
              group: [
                '~/components/casts/UnfocusedCast',
                '~/components/casts/FocusedCast',
              ],
              message:
                'You probably want ~/components/casts/Cast so it uses the global cast cache',
            },
          ],
          paths: [
            {
              name: 'localforage',
              message: 'Prefer utils in ~/utils/StorageUitls instead',
            },
            {
              name: '@tanstack/react-query',
              importNames: ['useMutation'],
              message:
                'Please write a memoized async function that handles optimistic updates and invalidations.',
            },
            {
              name: 'react-router-dom',
              importNames: [
                'Link',
                'NavLink',
                'useNavigate',
                'useParams',
                'useSearchParams',
              ],
              message:
                'Prefer navigation components in ~/components and hooks in ~/hooks/navigation.',
            },
            {
              name: 'linkify-it',
              message:
                'Prefer useLinkifyText hook in ~/hooks or the singleton linkify instance in ~/utils.',
            },
            {
              name: 'farcaster-client-hooks',
              importNames: [
                'useOnboardingState',
                'useMarkWalletConversationRead',
                'useRefreshWalletConversationForParticipants',
                'useUserAppContext',
                'useFeatureGate',
              ],
              message: 'Please use the corresponding local hook instead.',
            },
            {
              name: 'react-toastify',
              importNames: ['toast'],
              message:
                'Do not use React Toastify directly. Use toast() in utils/toast.ts instead.',
            },
            {
              name: '@radix-ui/react-tooltip',
              message: 'Please use ~/components/Tooltip instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // Generated media for the mock node, and end-to-end build output.
    ignores: ['e2e/fixtures/**', 'e2e/.tmp/**', 'e2e/screenshots/**'],
  },
  {
    files: ['e2e/**/*.mjs', 'src/hypersnap/fixtures/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        // Browser globals, used inside functions handed to the test page.
        document: 'readonly',
        fetch: 'readonly',
        indexedDB: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        window: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        URL: 'readonly',
        crypto: 'readonly',
        URLSearchParams: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    // The Hypercast client. It reads from a Hypersnap node and nothing
    // else, so the packages and modules that talk to the upstream client's
    // own services are off limits here, as is any second way to reach the
    // network. `src/hypersnap/http.ts` is the only caller of fetch.
    files: ['src/hypercast/**', 'src/hypersnap/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        'reportError',
        {
          name: 'XMLHttpRequest',
          message: 'All requests go through ~/hypersnap/http.',
        },
        {
          name: 'WebSocket',
          message: 'All requests go through ~/hypersnap/http.',
        },
        {
          name: 'EventSource',
          message: 'All requests go through ~/hypersnap/http.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'sendBeacon',
          message: 'All requests go through ~/hypersnap/http.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message: 'Prefer absolute imports using the `~` alias.',
            },
            {
              group: [
                'farcaster-client-*',
                'farcaster-client-*/**',
                '@farcaster/*',
                '@neynar/*',
                '@privy-io/*',
                '@solana/*',
                '@tanstack/react-query-persist-client',
                'posthog-js',
                'posthog-js/**',
                'statsig-*',
                '@statsig/*',
                'wagmi',
                'wagmi/**',
                '@wagmi/*',
              ],
              message:
                'Hypercast does not use the upstream client’s services, wallets or analytics.',
            },
            {
              group: [
                '~/constants/avatar',
                '~/constants/routes',
                '~/utils/images',
                '~/utils/linkify/*',
                '~/pages/*',
                '~/lazy/*',
              ],
              message:
                'This upstream module embeds upstream-operated hosts or routes. Use the Hypercast equivalent.',
            },
          ],
          paths: [
            {
              name: '@tanstack/react-query',
              importNames: ['useMutation'],
              message:
                'Writes go through the write module, which sends one signed message at a time.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/hypercast/**', 'src/hypersnap/**'],
    ignores: ['src/hypersnap/http.ts', '**/__tests__/**', '**/fixtures/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        'reportError',
        'XMLHttpRequest',
        'WebSocket',
        'EventSource',
        {
          name: 'fetch',
          message: 'Only ~/hypersnap/http may call fetch.',
        },
      ],
    },
  },
];
