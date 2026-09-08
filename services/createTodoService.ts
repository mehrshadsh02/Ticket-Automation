import type { AppConfig } from "../config/env.js";
import { centers } from "../config/centers.js";
import { MicrosoftGraphAuth } from "./MicrosoftGraphAuth.js";
import { MicrosoftGraphTodoService } from "./MicrosoftGraphTodoService.js";
import type { TodoService } from "./TodoService.js";

export function createTodoService(config: AppConfig): TodoService {
  const tokenProvider = new MicrosoftGraphAuth({
    clientId: config.MICROSOFT_CLIENT_ID,
    tenantId: config.MICROSOFT_TENANT_ID,
    tokenCachePath: config.MICROSOFT_TOKEN_CACHE_PATH,
  });
  return new MicrosoftGraphTodoService({
    todoListName: config.TODO_LIST_NAME,
    centers,
    tokenProvider,
  });
}
