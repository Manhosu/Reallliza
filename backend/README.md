<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

---

## External Integration API

System-to-system endpoints for creating Service Orders from external systems
(e.g. the Garantias ticketing system). Auth is API-Key, **not** JWT.

### Setup

1. Apply migration `database/migrations/007_external_integration.sql`.
2. Insert a `profiles` row to act as the `created_by` for integration-created OSs
   (see the commented seed block in that migration), then set
   `EXTERNAL_INTEGRATION_USER_ID` in `.env`.
3. Set `WEB_BASE_URL` and `WEBHOOK_SIGNING_SECRET` (generate with
   `openssl rand -hex 32`) in `.env`.
4. Add the external system's origin to `CORS_ORIGIN` if it will call from a browser.

### Generate an API Key

```bash
npx ts-node src/scripts/create-api-key.ts --name "Garantias" --system "GARANTIAS"
```

The plaintext key is printed **once** — store it securely. Only the SHA-256 hash
is persisted in `api_keys.key_hash`.

### Create a Service Order

```bash
curl -X POST https://<host>/api/external/service-orders \
  -H "X-API-Key: <key>" \
  -H "Content-Type: application/json" \
  -d '{
    "external_system": "GARANTIAS",
    "external_id": "TK-007060",
    "external_callback_url": "https://garantias.reallliza.com.br/api/webhook/enterprise-callback",
    "title": "Reinstalação de piso — TK-007060",
    "client_name": "Maria Silva",
    "client_phone": "+5511999999999",
    "address_city": "São Paulo",
    "address_state": "SP",
    "geo_lat": -23.5505,
    "geo_lng": -46.6333,
    "external_metadata": {
      "laudo_url": "https://.../laudo.pdf",
      "produto": "Piso vinílico X",
      "quantidade": 15,
      "unidade": "m²"
    }
  }'
```

Responses:
- `201` → `{ id, order_number, status, tracking_url, created_at }`
- `401` → missing or invalid `X-API-Key`
- `403` → `external_system` in payload doesn't match the API key's scope
- `409` → an OS already exists for `(external_system, external_id)`

### Look up by external ID

```
GET /api/external/service-orders/by-external/GARANTIAS/TK-007060
```

### Outbound Webhooks

When an OS originating from an external system changes status, Enterprise POSTs
to `external_callback_url`:

**Headers**
```
Content-Type: application/json
X-Webhook-Event: service_order.status_changed
X-Webhook-Signature: sha256=<hmac-sha256(body, WEBHOOK_SIGNING_SECRET)>
```

**Payload**
```json
{
  "event": "service_order.status_changed",
  "external_system": "GARANTIAS",
  "external_id": "TK-007060",
  "enterprise_order_id": "uuid",
  "from_status": "in_progress",
  "to_status": "completed",
  "timestamp": "2026-04-10T15:30:00Z",
  "data": {
    "technician_id": "uuid",
    "technician_name": "Carlos Instalador",
    "started_at": "...",
    "completed_at": "...",
    "final_value": 1850.00,
    "photos": [{ "type": "before", "url": "...", "captured_at": "..." }],
    "checklist_summary": { "completed": true, "items_ok": 12, "items_total": 12 },
    "tracking_url": "https://.../service-orders/uuid"
  }
}
```

**Events emitted**
- `service_order.created` — fired right after external creation
- `service_order.assigned` — when status transitions to `assigned`
- `service_order.status_changed` — any other transition
- `service_order.completed` — enriched with photos + checklist + final_value
- `service_order.cancelled` — enriched with `cancellation_reason`

**Signature verification (Node.js example)**
```js
import { createHmac, timingSafeEqual } from 'crypto';

function verify(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader || '');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

**Retries.** Failed deliveries are retried every 5 minutes by a cron worker,
with exponential backoff (1min → 5min → 15min → 1h → 6h). Max 5 attempts.
Receivers should respond `2xx` within 10 seconds and be idempotent.

### Swagger

See all external endpoints at `/api/docs` under the **External Integration** tag.

