export function createAdminUserApi(client) {
  return {
    async listUsers(params, { signal } = {}) {
      const response = await client.get("/admin/users", { params, signal });
      return response.data;
    },

    async getUser(userId, { signal } = {}) {
      const response = await client.get(
        `/admin/users/${encodeURIComponent(userId)}`,
        { signal },
      );
      return response.data;
    },

    async getUserActivity(userId, { signal } = {}) {
      const response = await client.get(
        `/admin/users/${encodeURIComponent(userId)}/activity`,
        { signal },
      );
      return response.data;
    },

    async suspendUser(userId, reason) {
      const response = await client.post(
        `/admin/users/${encodeURIComponent(userId)}/suspend`,
        { reason },
      );
      return response.data;
    },

    async reactivateUser(userId) {
      const response = await client.post(
        `/admin/users/${encodeURIComponent(userId)}/reactivate`,
        {},
      );
      return response.data;
    },
  };
}
