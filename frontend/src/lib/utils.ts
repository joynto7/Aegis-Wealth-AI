import { createCn } from "cn/config";

/**
 * Class merging that knows the type scale of Section 2.7.2. Without this,
 * text-caption, text-body and the rest look like unknown text colours, so a
 * colour such as text-(--text) passed alongside cancels the size (or the
 * other way round).
 */
export const cn = createCn({
  extend: {
    classGroups: { "font-size": [{ text: ["caption", "body", "form", "section", "page-title", "key-figure"] }] },
  },
});
