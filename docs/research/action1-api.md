# Action1 REST API: read-only CMDB sync reference

Research date: 2026-10-20. Scope: what Taskora needs to sync Action1 endpoints into the CMDB without writing anything back.

## Sources and how they were verified

| Tag used below | Source | What it is |
|---|---|---|
| **docs** | Action1's official OpenAPI 3.1.0 spec (`info.version` "3.1.0", title "Action1 API") | `https://www.action1.com/api-documentation/` links to `https://app.action1.com/apidocs`. That page is a JS-rendered Swagger UI. The spec isn't served as a separate JSON or YAML file: `/apidocs/swagger.json`, `/apidocs/openapi.json` and similar URLs all return 403. The spec is embedded as a JS object literal in `https://app.action1.com/apidocs/assets/index-BPnjAq_X.js`. I extracted it by parsing the text, without running the JS, and got 97 paths. The bundle filename has a content hash, so it changes whenever Action1 redeploys the docs. |
| **PSAction1** | `github.com/Action1Corp/PSAction1` (MIT), commit `6df6630`, 2026-09-16 | Action1's own PowerShell module, written by the vendor. Its README includes a real sample endpoint record. I read it to cross-check the auth format, paging behaviour and field names. |
| **action1-mcp** | `github.com/WYRE-AI/action1-mcp` (Apache-2.0), commit `8df2bcc`, 2026-10-14 | Third-party MCP server. Read only; I didn't run it or install its dependencies. |
| **uncertain** | n/a | Not in the spec, or the sources disagree. Check these against a real tenant before relying on them. |

Not used: Action1 MCP tools and any live tenant. I made no authenticated calls.

---

## 1. Region base URLs (docs)

These come from the OpenAPI `servers` array. Every path below is relative to one of these bases. The token endpoint is on the same host as the resource endpoints.

| Region (spec description) | Base URL | PSAction1 region key |
|---|---|---|
| North America | `https://app.action1.com/api/3.0` | `NorthAmerica` |
| North America 2 | `https://app.na-2.action1.com/api/3.0` | `NorthAmerica-2` / `NA-2` |
| Europe | `https://app.eu.action1.com/api/3.0` | `Europe` |
| United Kingdom | `https://app.uk.action1.com/api/3.0` | `UnitedKingdom` / `UK` |
| Australia | `https://app.au.action1.com/api/3.0` | `Australia` |

Notes:
- action1-mcp leaves out the **UK** region (`app.uk.action1.com`). PSAction1 and the spec both include it.
- There is no Asia-Pacific host. action1-mcp's changelog says `app.ap.action1.com` returns NXDOMAIN.
- Taskora should store the region as an enum and build the base URL from it. Don't accept a free-form host, because that would let a misconfigured integration send credentials to an arbitrary server.

## 2. Authentication

### Token request (docs + PSAction1)

```
POST {base}/oauth2/token          e.g. https://app.action1.com/api/3.0/oauth2/token
Content-Type: application/json

{ "client_id": "<API key / Client ID>", "client_secret": "<secret>" }
```

- The spec documents an **`application/json`** body with `client_id` and `client_secret`. The initial request has no `grant_type`. PSAction1, the vendor module, sends the same JSON with `Content-Type: application/json; charset=utf-8`.
- In the spec, `client_id` has `format: email`. The spec example looks like `api-key-<uuid>-<uuid>@action1.com`.
- action1-mcp sends `application/x-www-form-urlencoded` with `grant_type=client_credentials&client_id=…&client_secret=…` instead. The spec doesn't document this form (**uncertain**). Use JSON as documented. If the token call returns 400, form encoding is a possible fallback.
- The spec's `securitySchemes.oauth2` is declared as a `password` flow with `tokenUrl: /api/3.0/oauth2/token` and `refreshUrl: /api/3.0/oauth2/token`. Its description says to enter the Client ID and Client Secret, not user credentials. In practice it behaves like client credentials.
- Credentials are created in the Action1 console on the **API Credentials** page. action1-mcp's README says the secret can't be recovered after creation.

### Token response (docs)

```json
{ "access_token": "<JWT>", "refresh_token": "<token>", "expires_in": 3600, "token_type": "Bearer" }
```

- `expires_in` is declared `const: 3600`, so the token lasts **1 hour**. Refresh about 60 s early. PSAction1 refreshes 5 s early; action1-mcp refreshes 60 s early.
- Refresh request (docs): the same endpoint with JSON `{ "client_id", "refresh_token", "grant_type": "refresh_token" }`. For a periodic sync it's simpler to request a new token with the client secret, which is what action1-mcp does.

### Using the token (docs)

Send `Authorization: Bearer <access_token>` on every call. The spec's OAuth tag description says so explicitly. Also send `Accept: application/json`.

### Permissions

Each operation's description in the spec lists the permission it needs. `security` lists role names `enterprise admin`, `organization admin`, `manager` and `viewer`. A read-only Taskora credential needs:

| Permission (docs) | Needed for |
|---|---|
| `view_endpoints` | list/get endpoints, per-endpoint missing updates, groups |
| `view_installed_software` (or `view_endpoints` for the per-endpoint call) | installed software |
| `view_vulnerabilities` | vulnerabilities |
| one of `approve_updates`, `view_dashboards`, `manage_automations` | org-wide `/updates/{orgId}`; `view_dashboards` is the read-only choice |

## 3. Endpoints for read-only sync (all docs unless marked)

`{orgId}` is `Organization.id`, a UUID. Wherever the spec uses the `orgIdOrAll` parameter, the literal value **`all`** is accepted and means "every organization this credential can access" (docs). Endpoint objects include an `organization_id` field, so you can attribute rows even when you query `all`.

| Purpose | Method + path | Notable query params | Response |
|---|---|---|---|
| List organizations | `GET /organizations` | `admin=Yes\|No` | ResultPage of `Organization` |
| Has the org any endpoints? | `GET /endpoints/status/{orgId}` | n/a | `{ id, type:"EndpointStatus", self, endpoints_added: "yes"\|"no" }` |
| **List endpoints** | `GET /endpoints/managed/{orgId}` (orgId may be `all`) | `limit`, `from`, `sortby`, `filter`, `fields` (`*`, `missing_updates`, `vulnerabilities`), `status`, `online_status`, `update_status`, `vulnerability_status`, `reboot_required`, `os`, `reset_cache` | `EndpointsResultPage` (items = `Endpoint`). The spec says "Etag and Last-Modified may be included in the response." |
| **Get one endpoint** | `GET /endpoints/managed/{orgId}/{endpointId}` | none documented | `Endpoint` (not wrapped) |
| Missing updates for one endpoint | `GET /endpoints/managed/{orgId}/{endpointId}/missing-updates` | `limit`, `from`, `sortby`, `filter`, `approval_status`, `security_severity` | ResultPage of MissingUpdate (App / Windows / Mac variants) |
| Missing updates org-wide | `GET /updates/{orgId}` (orgId may be `all`) | `limit`, `from`, `sortby`, `filter`, `approval_status`, `custom`, `builtin`, `security_severity`, `fields`, `only_latest`, `update_sla_start_day`, `update_sla_end_day` | ResultPage of MissingUpdate |
| Endpoints missing one update | `GET /updates/{orgId}/{packageId}/versions/{versionId}/endpoints` | `limit`, `from`, `sortby`, `filter` | ResultPage of `{id,type,self,name,installed_version}` |
| Installed software, org | `GET /installed-software/{orgId}/data` | `limit`, `from`, `sortby`, `filter`, `live_only` | ReportResultPage of report rows (`fields` object) |
| **Installed software, one endpoint** | `GET /installed-software/{orgId}/data/{endpointId}` | `limit`, `from`, `sortby`, `filter` | ResultPage of report rows |
| Vulnerabilities, org | `GET /vulnerabilities/{orgId}` (orgId may be `all`) | `endpoint_id`, `CVEIDs`, `score`, `remediation_status`, `published_date_start/end`, `remediation_required_start_day/end_day`, `limit`, `from`, `sortby`, `filter`, `reset_cache` | ResultPageAbridged of `Vulnerability` |
| Endpoints affected by a CVE | `GET /vulnerabilities/{orgId}/{cveId}/endpoints` | n/a | n/a |
| Endpoint groups | `GET /endpoints/groups/{orgId}` and `…/{groupId}/contents` | `limit`, `from`, `sortby`, `filter` | ResultPage |
| License usage per org | `GET /subscription/usage/organizations` | n/a | needs `manage_organizations`, so skip it for a read-only credential |

Path aliases (**uncertain**; avoid them):
- action1-mcp and PSAction1 call `/policies/instances/{orgId}`. The current spec path is `/automations/instances/{orgId}`. Taskora doesn't need either.
- PSAction1 calls `/apps/{orgId}/data[/{endpointId}]`. The current spec path is `/installed-software/{orgId}/data[/{endpointId}]`. Use the spec path. The old `/apps/` path seems to still be accepted, but I haven't confirmed that.

Gotcha (action1-mcp, empirical): Action1's gateway answers an **unknown route with 403, not 404**. If you get a 403 from an endpoint that ought to work, suspect the path before suspecting permissions.

## 4. Pagination

**Request** (docs): `limit` is the page size, `minimum: 1`. `from` is the zero-based index of the first record.

**Response envelope** (docs, `ResultPage`):

```json
{
  "id": "1", "type": "ResultPage", "self": "...",
  "items": [ ... ],
  "total_items": 100,
  "limit": "10",
  "next_page": "<URL of next page, empty on last page>",
  "prev_page": "<URL of previous page, empty on first page>"
}
```

- The `ResultPageAbridged` variant, used by `/vulnerabilities`, has `total_items`, `limit`, `from` and `items`, with no next or previous link.
- `total_items` and `limit` are typed `string` in the spec, but the examples show numbers. Parse them leniently, for example `Number(x)`.
- The spec example for `next_page` is a placeholder (`/API/...?from=60&limit=10`). PSAction1 passes `next_page` unchanged as the request URI to `Invoke-WebRequest`, which needs an absolute URL. That means the live value is probably an absolute URL (**inference**). Resolve it with `new URL(next_page, baseOrigin)` so both forms work.
- **Maximum page size: not documented.** PSAction1 caps its own requests at 200. action1-mcp's tool schema says "max 500", but that's the MCP tool's own limit, not an API limit. Use `limit=100` to `200`.
- Recommended loop (follows PSAction1): request `limit=N` (with `from=0`), then keep going with `from = from + items.length` while `from < total_items`. If `total_items` is missing, follow `next_page` until it's empty. Stop if a page has no items or the offset doesn't advance, and keep a set of URLs already requested so a loop can't repeat.
- Quirks noted in the PSAction1 source:
  - Some endpoints treat an explicit `from=0` on the first page differently. PSAction1 has an `OmitInitialOffset` switch for this.
  - `limit=1` without `from` can return an empty first page.
  - Don't stop on an empty first page if `next_page` is present.
- **Known bug in action1-mcp:** it treats list responses as bare arrays (`endpoints.length`) and never follows pages. The spec says list responses are the ResultPage object above. Don't copy its list handling.

## 5. Rate limits and errors

- **Rate limit (docs):** every operation documents **HTTP 429** "Too many requests". It comes with a **`Retry-After`** header (integer seconds, example 30) and an error body that includes `details.retry_after`:
  ```json
  { "id": "0", "type": "Error", "status": 429,
    "developer_message": "Request rate limit exceeded. Please try again in 30 seconds.",
    "user_message": "Request rate limit exceeded. Please try again in 30 seconds.",
    "details": { "retry_after": 30 } }
  ```
- **Numeric limits (requests per minute and so on) aren't documented anywhere.** I found no `X-RateLimit-*` headers in the spec.
- PSAction1's behaviour on 429: wait `details.retry_after` seconds if it's present, otherwise back off exponentially as `2^n × 2 s`. Taskora should check `Retry-After` first, then `details.retry_after`, then fall back to exponential backoff with a retry cap.
- **Errors (docs):** 400, 401, 403, 429 and 500 all return `{ id: "0", type: "Error", status, developer_message, user_message }`. 401 means not authenticated, so get a new token once and retry. 403 means no access, or a wrong path as described in section 3.

## 6. Endpoint object fields

Fields are documented on the spec's `Endpoint` schema unless marked otherwise. "PSAction1 sample" means the field appears in the real record printed in the PSAction1 README.

| Field | Type / format | Status | Notes |
|---|---|---|---|
| `id` | string (UUID in sample) | verified in docs | From `Base`. Use it as the external key. |
| `type` | `"Endpoint"` | verified in docs | |
| `self` | string URL | verified in docs | PSAction1 sample: `https://app.action1.com/api/3.0/endpoints/managed/<org>/<id>/general`. This is an API URL, not a console link. |
| `organization_id` | string (UUID) | verified in docs | Useful when querying with `orgId=all`. |
| `name` | string | verified in docs, action1-mcp | Display name. Users can rename it, through PATCH or the UI. |
| `device_name` | string | verified in docs, action1-mcp | The original device name. The spec says it "equals 'name' by default" and is "displayed only in the endpoint details". In the PSAction1 sample it's **empty** in list output. Prefer `device_name` for the hostname and fall back to `name`. |
| `status` | enum `Connected` / `Disconnected` / `Pending Uninstall` | verified in docs, action1-mcp | Agent connection state. |
| `online_status` | enum `SUCCESS` (seen ≤7 days) / `WARNING` (8–30 days) / `ERROR` (>30 days) | verified in docs | The PSAction1 sample shows `UNDEFINED`, so accept unknown values. |
| `last_seen` | string `YYYY-MM-DD_HH-mm-ss` | verified in docs, action1-mcp | **Not ISO 8601.** Parse it explicitly. The spec doesn't give a timezone (probably UTC; **uncertain**). |
| `address` | string, IPv4 | verified in docs, action1-mcp | One IP only. |
| `MAC` | string, e.g. `44:34:AB:FA:23:98` | verified in docs | Uppercase key. One MAC only. |
| `OS` | string, e.g. `Windows 11 (23H2)`, `macOS Sonoma` | verified in docs, action1-mcp | Uppercase key. The spec gives an enum of Windows/macOS names; Linux strings aren't enumerated. |
| `platform` | string | verified in docs (enum `Windows`/`Mac`/`Linux`) | The PSAction1 sample shows `Windows_64`, which isn't in the enum. Treat it as free text. |
| `architecture` | enum `x86`/`x64`/`Intel CPU`/`Apple Silicon` | verified in docs | |
| `agent_version` | string, e.g. `5.179.579.1` | verified in docs, action1-mcp | |
| `agent_install_date` | `YYYY-MM-DD_HH-mm-ss` | verified in docs | |
| `last_boot_time` | `YYYY-MM-DD_HH-mm-ss` | verified in docs | |
| `subscription_status` | `Active`/`Inactive` | verified in docs | |
| `user` | string, e.g. `CORP\\helpdesk` | verified in docs, action1-mcp | The user currently or last logged on interactively. |
| `serial` | string | verified in docs, action1-mcp | The spec example is a number. PSAction1 sample shows `"0"` on a VM, so treat `"0"` and empty as unknown. |
| `manufacturer` | string, e.g. `Dell Inc.` | verified in docs | |
| **model** | n/a | **not in the spec** | There's no device-model field. `CPU_model` is the CPU. Leave the CMDB model empty or take it from another source. |
| `CPU_name`, `CPU_model`, `CPU_size` | string | verified in docs | |
| `RAM`, `disk`, `video`, `NIC`, `WiFi` | free-text strings, e.g. `32Gb DDR4`, `954Gb SSD` | verified in docs | Human-readable text, not numbers. |
| `AD_organization_unit` | string | verified in docs | |
| `AD_security_groups` | string[] | verified in docs | |
| `comment` | string | verified in docs | User-editable. The PSAction1 sample shows the literal string `None`. |
| `reboot_required` | enum `"Yes"`/`"No"` (strings) | verified in docs | action1-mcp also accepts booleans and lowercase `yes`/`no`. Parse it the same tolerant way. |
| `update_status` | `SUCCESS`/`WARNING`/`ERROR` | verified in docs | The PSAction1 sample shows `UNDEFINED`. The spec says it's returned only with `fields=*`. |
| `vulnerability_status` | `SUCCESS`/`WARNING`/`ERROR` | verified in docs | The PSAction1 sample shows `UNDEFINED`. |
| `missing_updates` | `{ critical: number, other: number }` | verified in docs | **Returned only with `fields=*` or `fields=missing_updates`.** The spec warns these counts can be "10-20x" slower to compute. |
| `vulnerabilities` | `{ critical: number, other: number }` | verified in docs | Only with `fields=*` or `fields=vulnerabilities`. |
| `custom` | `[{ name, value }]` | verified in docs | Endpoint custom attributes. |
| `missing_critical_updates`, `missing_other_updates` (flat numbers) | n/a | **uncertain** (action1-mcp only) | action1-mcp's card reads these flat keys. The spec's `UpdateStatus` description uses these names in prose, but the `Endpoint` schema has the nested `missing_updates.critical/other`. Accept both. |
| `OS_version`, `hostname`, `ip_address`, `os` | n/a | **uncertain** (action1-mcp fallbacks only) | Not in the spec. action1-mcp's tests use them as made-up fixture variants. |
| `online` boolean | n/a | not documented | Derive online state from `status === "Connected"` or from `online_status`. |

Whether **`GET /endpoints/managed/{orgId}/{endpointId}`** (single endpoint) accepts `fields=` isn't documented. Get the counts from the list call with `fields=missing_updates`, or count the items from `/missing-updates`.

### Related objects (docs)

- **Organization:** `id`, `type: "Organization"`, `self`, `name`, `description`.
- **Missing update item:** `id`, `type`, `self`, `name`, `vendor`, `description`, `update_type` (`App` / `Windows` / Mac), `kb_number` (Windows), `reboot_needed`, `size`, `optional`, `recommended`, `organization_ids[]`. Also `versions[]`, where each version has `version`, `security_severity` (`Critical|Important|Moderate|Low|Unspecified`), `update_type` (e.g. `Security Updates`), `release_date`, `security_CVE` (comma-separated string), `approval_status` (`New|Approved|Declined`), `update_sla_deadline` and `update_sla_status`.
- **Installed software row** (per endpoint): `id`, `type: "ReportRow"`, `self`, `last_refresh`, `response_type` (`live|cache`), and `fields` with **space-separated keys**: `Name`, `Version`, `Vendor`, `Platform`, `Install Type`, `Update Status` (`Update Available|Current|None`), `Install Location`, `Installed For`, `Install Date` (e.g. `20240430`), `_Missing_Updates[]`.
- **Vulnerability:** `cve_id`, `cvss_score`, `published_date`, `vector_string`, `remediation_status`, `remediation_deadline`, `endpoints_count`, `software`, `cisa_kev` (`Yes|No`), `organization_id` / `organization_ids`.

## 7. Console deep links

- **Endpoint-specific deep link: not documented.** It isn't in the OpenAPI spec, the action1-mcp source or the PSAction1 source. Don't build one by guessing.
- **Org-level console URL (documented by PSAction1 README):** `https://app.action1.com/console/dashboard?org=<orgId>`. The README gives it as the place to find your Org ID. Using the regional host for other regions, for example `https://app.eu.action1.com/console/dashboard?org=<orgId>`, is an **inference**.
- For now, Taskora's "Open in Action1" button should go to the org dashboard. Use a per-endpoint link only after checking the URL format in a real console.

## 8. Mock fixtures (fictional data)

Shapes follow the spec. All IDs, names, IPs and serials are made up.

### `POST /oauth2/token` → 200
```json
{
  "access_token": "eyFAKE.ACCESS.TOKEN",
  "refresh_token": "eyFAKE.REFRESH.TOKEN",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### `GET /organizations` → 200
```json
{
  "id": "1",
  "type": "ResultPage",
  "self": "https://app.eu.action1.com/api/3.0/organizations?from=0&limit=100",
  "items": [
    {
      "id": "7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001",
      "type": "Organization",
      "self": "https://app.eu.action1.com/api/3.0/organizations/7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001",
      "name": "Northstar Consulting",
      "description": "Managed customer - Utrecht office"
    }
  ],
  "total_items": 1,
  "limit": "100",
  "next_page": "",
  "prev_page": ""
}
```

### `GET /endpoints/managed/{orgId}?limit=2&from=0&fields=missing_updates` → 200 (page 1 of 2)
```json
{
  "id": "1",
  "type": "ResultPage",
  "self": "https://app.eu.action1.com/api/3.0/endpoints/managed/7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001?from=0&limit=2&fields=missing_updates",
  "items": [
    {
      "id": "e5a0c3f2-2222-4d7e-8f10-0b0b0b0b0014",
      "type": "Endpoint",
      "self": "https://app.eu.action1.com/api/3.0/endpoints/managed/7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001/e5a0c3f2-2222-4d7e-8f10-0b0b0b0b0014/general",
      "organization_id": "7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001",
      "name": "NS-LAPTOP-014",
      "device_name": "NS-LAPTOP-014",
      "status": "Connected",
      "online_status": "SUCCESS",
      "last_seen": "2026-10-19_08-41-07",
      "address": "10.20.30.114",
      "MAC": "3C:52:82:00:00:14",
      "OS": "Windows 11 (24H2)",
      "platform": "Windows_64",
      "architecture": "x64",
      "agent_version": "5.300.100.1",
      "agent_install_date": "2025-03-02_10-15-00",
      "last_boot_time": "2026-10-18_07-55-12",
      "subscription_status": "Active",
      "user": "NORTHSTAR\\emma.smith",
      "serial": "FAKE5CD0014",
      "manufacturer": "Contoso Devices",
      "CPU_name": "Intel(R) Core(TM) i7-1365U",
      "CPU_model": "Intel64 Family 6 Model 186 Stepping 3",
      "CPU_size": "1.8 GHz, 10/12 Cores",
      "RAM": "16Gb DDR5",
      "disk": "512Gb SSD",
      "video": "Intel(R) Iris(R) Xe Graphics, 1Gb",
      "NIC": "Intel(R) Ethernet Connection I219-LM, 1000 Mbps",
      "WiFi": "Intel(R) Wi-Fi 6E AX211 160MHz, 1201 Mbps",
      "AD_organization_unit": "northstar.local/Workstations/Consultants",
      "AD_security_groups": ["Consultants"],
      "comment": "Emma Smith - primary laptop",
      "reboot_required": "Yes",
      "update_status": "ERROR",
      "vulnerability_status": "WARNING",
      "missing_updates": { "critical": 2, "other": 5 },
      "custom": [{ "name": "Asset Tag", "value": "NS-0014" }]
    },
    {
      "id": "e5a0c3f2-2222-4d7e-8f10-0b0b0b0b0021",
      "type": "Endpoint",
      "self": "https://app.eu.action1.com/api/3.0/endpoints/managed/7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001/e5a0c3f2-2222-4d7e-8f10-0b0b0b0b0021/general",
      "organization_id": "7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001",
      "name": "Reception PC",
      "device_name": "NS-DESK-021",
      "status": "Disconnected",
      "online_status": "WARNING",
      "last_seen": "2026-10-02_16-03-44",
      "address": "10.20.30.121",
      "MAC": "3C:52:82:00:00:21",
      "OS": "Windows 10 (22H2)",
      "platform": "Windows_64",
      "agent_version": "5.290.88.1",
      "subscription_status": "Active",
      "user": "NORTHSTAR\\reception",
      "serial": "0",
      "manufacturer": "Contoso Devices",
      "comment": "",
      "reboot_required": "No",
      "update_status": "WARNING",
      "vulnerability_status": "SUCCESS",
      "missing_updates": { "critical": 0, "other": 3 },
      "custom": []
    }
  ],
  "total_items": 3,
  "limit": "2",
  "next_page": "https://app.eu.action1.com/api/3.0/endpoints/managed/7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001?from=2&limit=2&fields=missing_updates",
  "prev_page": ""
}
```
Page 2 should return one item with `"next_page": ""`. Add a variant whose `next_page` is relative (`/api/3.0/endpoints/managed/...`) and one where `total_items` is the string `"3"`, to test the lenient parsing.

### `GET /endpoints/managed/{orgId}/{endpointId}/missing-updates` → 200
```json
{
  "id": "1",
  "type": "ResultPage",
  "self": "https://app.eu.action1.com/api/3.0/endpoints/managed/7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001/e5a0c3f2-2222-4d7e-8f10-0b0b0b0b0014/missing-updates?from=0&limit=100",
  "items": [
    {
      "id": "Example_Browser_1700000000001_builtin",
      "type": "SoftwareRepositoryPackage",
      "self": "https://app.eu.action1.com/api/3.0/software-repository/7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001/Example_Browser_1700000000001_builtin",
      "name": "Example Browser",
      "vendor": "Example Software Ltd",
      "update_type": "App",
      "reboot_needed": "Possibly",
      "versions": [
        {
          "version": "Latest",
          "security_severity": "Critical",
          "update_type": "Security Updates",
          "release_date": "2026-10-14",
          "security_CVE": "CVE-2099-0001, CVE-2099-0002",
          "approval_status": "Approved",
          "update_sla_status": "Due soon"
        }
      ]
    },
    {
      "id": "win_kb5099999",
      "type": "SoftwareRepositoryPackage",
      "name": "2026-10 Cumulative Update for Windows 11 Version 24H2",
      "vendor": "Microsoft",
      "update_type": "Windows",
      "kb_number": "KB5099999",
      "reboot_needed": "Possibly",
      "versions": [{ "version": "Latest", "security_severity": "Critical", "update_type": "Security Updates", "approval_status": "New" }]
    }
  ],
  "total_items": 2,
  "limit": "100",
  "next_page": "",
  "prev_page": ""
}
```

### `GET /installed-software/{orgId}/data/{endpointId}` → 200
```json
{
  "id": "1",
  "type": "ResultPage",
  "items": [
    {
      "id": "Example%20Office%20Suite",
      "type": "ReportRow",
      "self": "https://app.eu.action1.com/api/3.0/installed-software/7c1e2a90-1111-4a6b-9c55-0a0a0a0a0001/data/e5a0c3f2-2222-4d7e-8f10-0b0b0b0b0014",
      "last_refresh": "2026-10-19_08-40-00",
      "response_type": "cache",
      "fields": {
        "Name": "Example Office Suite",
        "Version": "16.0.1234.5678",
        "Vendor": "Example Software Ltd",
        "Platform": "Windows",
        "Install Type": "msi",
        "Update Status": "Current",
        "Install Location": "C:\\Program Files\\Example Office",
        "Installed For": "All",
        "Install Date": "20260301"
      }
    }
  ],
  "total_items": 1,
  "limit": "100",
  "next_page": "",
  "prev_page": ""
}
```

### 429 → retry
```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
Content-Type: application/json

{"id":"0","type":"Error","status":429,"developer_message":"Request rate limit exceeded. Please try again in 30 seconds.","user_message":"Request rate limit exceeded. Please try again in 30 seconds.","details":{"retry_after":30}}
```

### 403 on wrong path (empirical, per action1-mcp)
```json
{ "id": "0", "type": "Error", "status": 403, "developer_message": "Access denied.", "user_message": "You do not have access to this resource." }
```
The message text above is made up. The spec only documents the shape.

## 9. Implementation notes for Taskora

1. Store `region`, `clientId` and `clientSecret` (encrypted) per integration. Cache the token in memory and refresh it about 60 s before it expires. On a 401, get a new token once and retry.
2. Sync loop: `GET /organizations`. For each org you've mapped to a Taskora company, call `GET /endpoints/managed/{orgId}?limit=200&fields=missing_updates` and page through. Alternatively, make one call with `orgId=all` and group by `organization_id`. Upsert by `id`.
3. Normalise dates from `YYYY-MM-DD_HH-mm-ss`. Map `reboot_required` from `"Yes"`/`"No"` to a boolean. Map hostname as `device_name || name`. Treat serial `"0"` or empty as null.
4. Fetch per-endpoint missing updates and installed software lazily (on demand, or in a slower second pass), because of the cost warning in the spec.
5. Handle 429 with `Retry-After`. Keep requests sequential, or limit concurrency to 2–3, because the limits aren't documented.
6. Integration tests should use the fixtures above, including the edge cases: relative `next_page`, string `total_items`, an empty first page that still has `next_page`, and `UNDEFINED` enum values.

## 10. Confirmed vs uncertain

**Confirmed (official OpenAPI spec, and where noted the vendor's PSAction1):**
- The five region hosts, including UK, and the `/api/3.0` prefix.
- `POST /oauth2/token` with a JSON body `{client_id, client_secret}`, returning `expires_in` 3600 and `token_type` Bearer. The refresh grant uses JSON `{client_id, refresh_token, grant_type:"refresh_token"}`.
- The `Authorization: Bearer` header.
- All paths in section 3, their query parameters, the `orgId=all` option, and the permissions each one requires.
- The ResultPage envelope (`items`, `total_items`, `limit`, `next_page`, `prev_page`) and the `limit`/`from` parameters.
- 429 with a `Retry-After` header and `details.retry_after`, plus the shape of error bodies.
- The Endpoint fields marked "verified in docs" in section 6, and that `missing_updates` and `vulnerabilities` counts need `fields=`.
- The org dashboard console URL `…/console/dashboard?org=<orgId>`, documented in the PSAction1 README for NA.

**Uncertain or not documented:**
- Numeric rate limits (requests per minute or per hour).
- The maximum `limit` (page size). PSAction1 uses 200 itself.
- Whether `next_page` is absolute or relative in live responses. It's probably absolute.
- The token endpoint's form-urlencoded and `grant_type=client_credentials` variant, which action1-mcp uses but the spec doesn't document.
- Flat `missing_critical_updates` / `missing_other_updates` versus nested `missing_updates.{critical,other}` in live payloads.
- Whether the single-endpoint GET accepts `fields=`.
- Which timezone `last_seen` and similar timestamps use.
- `platform` values beyond the enum: the real sample shows `Windows_64`.
- A device **model** field, which doesn't exist in the spec.
- A per-endpoint console deep link, which isn't documented.
- Whether the old `/policies/...` and `/apps/...` aliases still work. Don't use them.
- ETag and Last-Modified: the spec mentions them for the list response, but conditional-request support (`If-None-Match`) isn't documented.
