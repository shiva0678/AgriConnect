import assert from "node:assert/strict";
import test from "node:test";
import { createAdminUserApi } from "../src/services/adminUserApiCore.js";
import {
  buildAdminUserListParams,
  getAdminUserErrorMessage,
  validateSuspendReason,
} from "../src/pages/admin/adminUserUtils.js";

test("admin user list parameters trim search and carry only allowlisted filters and cursor", () => {
  assert.deepEqual(
    buildAdminUserListParams({
      search: "  Nashik  ",
      role: "farmer",
      status: "suspended",
      cursor: {
        before: "2026-11-24T12:30:00.123456Z",
        beforeId: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0",
      },
    }),
    {
      limit: 25,
      q: "Nashik",
      role: "farmer",
      status: "suspended",
      before: "2026-11-24T12:30:00.123456Z",
      beforeId: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0",
    },
  );
  assert.deepEqual(buildAdminUserListParams({
    search: " ",
    role: "admin",
    status: "pending",
    cursor: { before: "only-one-value" },
  }), { limit: 25 });
});

test("suspension reason validation matches trimmed backend character limits", () => {
  assert.deepEqual(validateSuspendReason("  Policy violation  "), {
    valid: true,
    reason: "Policy violation",
    message: "",
  });
  assert.equal(validateSuspendReason("  ").valid, false);
  assert.equal(validateSuspendReason("ab").valid, false);
  assert.equal(validateSuspendReason("x".repeat(501)).valid, false);
  assert.equal(validateSuspendReason("🙂".repeat(500)).valid, true);
  assert.equal(validateSuspendReason("🙂".repeat(501)).valid, false);
});

test("admin user API builds the expected routes, params, bodies, and cancellation options", async () => {
  const calls = [];
  const client = {
    async get(...args) {
      calls.push(["get", ...args]);
      return { data: { success: true } };
    },
    async post(...args) {
      calls.push(["post", ...args]);
      return { data: { success: true } };
    },
  };
  const api = createAdminUserApi(client);
  const signal = { aborted: false };
  const params = { q: "buyer", role: "buyer", limit: 25 };

  await api.listUsers(params, { signal });
  await api.getUser("user-1", { signal });
  await api.getUserActivity("user-1", { signal });
  await api.suspendUser("user-1", "Policy violation");
  await api.reactivateUser("user-1");

  assert.deepEqual(calls, [
    ["get", "/admin/users", { params, signal }],
    ["get", "/admin/users/user-1", { signal }],
    ["get", "/admin/users/user-1/activity", { signal }],
    ["post", "/admin/users/user-1/suspend", { reason: "Policy violation" }],
    ["post", "/admin/users/user-1/reactivate", {}],
  ]);
  assert.equal("adminId" in calls[3][2], false);
  assert.equal("adminId" in calls[4][2], false);
});

test("user-management error messages are mapped without exposing server details", () => {
  assert.equal(
    getAdminUserErrorMessage({
      response: { status: 409, data: { message: "private database detail" } },
    }, "suspend"),
    "This account is already suspended. Refresh to see its current status.",
  );
  assert.doesNotMatch(
    getAdminUserErrorMessage({
      response: { status: 503, data: { message: "private database detail" } },
    }),
    /private database detail/,
  );
});
