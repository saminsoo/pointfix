# Note format

A note as stored (`.ui-feedback/<id>.json`, `GET <endpoint>?notes`, `.ui-feedback-inbox/notes.json`):

```json
{
  "id": "3c10779c",
  "createdAt": "2026-10-07T15:26:12.345Z",
  "pageUrl": "/products/12?tab=photos",
  "pageTitle": "Product 12",
  "comment": "Make the size buttons smaller and put them in two columns",
  "devices": ["desktop"],
  "viewport": { "width": 1536, "height": 730 },
  "userAgent": "Mozilla/5.0 ...",
  "elements": [
    {
      "selector": "div.layout:nth-of-type(1) > aside > button:nth-of-type(8)",
      "tag": "button",
      "id": null,
      "classes": ["size", "size-active"],
      "text": "20×30",
      "components": ["SizeButton", "SizeBar", "PhotoConfigurator"],
      "source": "src/components/size-bar.tsx:41",
      "attributes": { "aria-label": "Size 20×30" },
      "rect": { "x": 123, "y": 527, "width": 211, "height": 44 },
      "layer": 0,
      "styles": { "position": "static", "display": "block", "width": "211px", "height": "44px" }
    }
  ],
  "hasImage": true,
  "status": "open",
  "reply": null,
  "repliedAt": null,
  "resolvedAt": null
}
```

| Field | Notes |
|---|---|
| `id` | 8 characters, lowercase letters, digits and dashes. |
| `pageUrl` | Path and query of the page (never another origin). |
| `devices` | Any of `desktop`, `tablet`, `mobile`; at least one. Chosen by the owner, preselected from the window width and the widget's `breakpoints`. |
| `viewport` | CSS pixels of the window when the note was made. |
| `elements` | Up to 30, in the order picked; element *n* is the box numbered *n* on the screenshot. |
| `elements[].components` | Innermost first. Only in development builds of React, Vue, Svelte and Angular; empty otherwise. |
| `elements[].source` | File (and line) when the framework exposes it in development (Vue SFCs, Svelte, older React). Often null. |
| `elements[].rect` | Box in the viewport at the moment the note was made. |
| `elements[].layer` | 0 = topmost element under the pointer; higher = the owner went down through overlapping layers. |
| `hasImage` | The screenshot is `<id>.png` next to the JSON, or `GET <endpoint>?image=<id>`. It includes the numbered boxes and the owner's marks. |
| `status` | `open` or `resolved`. |
| `reply` / `repliedAt` | Your answer (`scripts/ui-feedback.mjs reply`). Shown on the notes page. |

The endpoint validates and caps everything it receives (strings, lists, image size and PNG signature); unknown fields are dropped.
