'use strict';

const SECRET_PATTERNS = [
  /authorization/i,
  /x-api-key/i,
  /bearer\s+\S+/i,
  /\bpit-[A-Za-z0-9-]{8,}/i,
  /\bsk-ant-[A-Za-z0-9-_]{8,}/i,
  /\bwebhook[_-]?secret/i,
];

function redact(input) {
  if (input == null) return input;
  if (typeof input === 'string') {
    let s = input;
    for (const re of SECRET_PATTERNS) {
      s = s.replace(re, '[REDACTED]');
    }
    return s;
  }
  if (Array.isArray(input)) return input.map(redact);
  if (typeof input === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      if (SECRET_PATTERNS.some((re) => re.test(k))) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return input;
}

function log(level, msg, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...redact(meta),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
