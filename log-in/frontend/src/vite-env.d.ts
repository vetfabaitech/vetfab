/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_OAUTH_REDIRECT_URI: string;
  readonly VITE_GITHUB_CLIENT_ID: string;
  readonly VITE_GITHUB_OAUTH_REDIRECT_URI: string;
  readonly VITE_APP_URL: string;
  readonly VITE_ENABLE_MOCK_AUTH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
