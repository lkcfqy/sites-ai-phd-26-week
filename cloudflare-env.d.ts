declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    GRADER_URL?: string;
    GRADER_TOKEN?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    AI_DAILY_LIMIT?: string;
    BUCKET?: R2Bucket;
  }
}
