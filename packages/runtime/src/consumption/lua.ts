/** Atomic tryConsume — returns [allowed, count, replay, reason] */
export const TRY_CONSUME_SCRIPT = `
local count_key = KEYS[1]
local reqs_key = KEYS[2]
local limit_arg = ARGV[1]
local request_id = ARGV[2]

local limit = tonumber(limit_arg)
local unlimited = (limit_arg == "" or limit_arg == "-1")

if request_id ~= "" then
  if redis.call("SISMEMBER", reqs_key, request_id) == 1 then
    local current = tonumber(redis.call("GET", count_key) or "0")
    return {1, current, 1, "idempotent replay"}
  end
end

local current = tonumber(redis.call("GET", count_key) or "0")
if not unlimited and current >= limit then
  return {0, current, 0, "max_actions exceeded"}
end

local next = current + 1
redis.call("SET", count_key, next)
if request_id ~= "" then
  redis.call("SADD", reqs_key, request_id)
end
return {1, next, 0, ""}
`;

/** Atomic release — returns new count */
export const RELEASE_SCRIPT = `
local count_key = KEYS[1]
local reqs_key = KEYS[2]
local request_id = ARGV[1]

local current = tonumber(redis.call("GET", count_key) or "0")
if current > 0 then
  redis.call("DECR", count_key)
end
if request_id ~= "" then
  redis.call("SREM", reqs_key, request_id)
end
return tonumber(redis.call("GET", count_key) or "0")
`;
