import { api } from "./api";
import { createAdminUserApi } from "./adminUserApiCore";

export const adminUserApi = createAdminUserApi(api);
