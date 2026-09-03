import type { ChangeRequestReference } from "@t3tools/contracts";

const MAX_TITLE_LENGTH = 240;

export function applyChangeRequestReferences(
  content: { readonly title: string; readonly body: string },
  references: ReadonlyArray<ChangeRequestReference>,
): { title: string; body: string } {
  if (references.length === 0) return { ...content };

  const primary = references[0]!;
  const titleAlreadyReferencesPrimary = content.title
    .toLowerCase()
    .includes(primary.key.toLowerCase());
  const title = titleAlreadyReferencesPrimary
    ? content.title
    : `[${primary.key}] ${content.title}`.slice(0, MAX_TITLE_LENGTH).trimEnd();
  const missingReferences = references.filter((reference) => !content.body.includes(reference.url));
  if (missingReferences.length === 0) return { title, body: content.body };

  const referenceLines = missingReferences.map(
    (reference) => `- [${reference.key}](${reference.url})`,
  );
  const existingBody = content.body.trimEnd();
  return {
    title,
    body: [
      ...(existingBody ? [existingBody, ""] : []),
      "## Related work",
      "",
      ...referenceLines,
    ].join("\n"),
  };
}
