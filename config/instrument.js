import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://beb309f4b17fac97c582907be3fd2147@o4511472379166720.ingest.us.sentry.io/4511472383688704",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});