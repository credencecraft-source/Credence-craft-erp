import type { Prisma } from "@prisma/client";

export type OrderMasterSnapshot = {
  articleCode: string | null;
  master_article_id: string | null;
  master_variant_id: string | null;
};

type OrderMasterSnapshotSource = {
  article?: string | null;
  colors?: string | null;
  existingMasterArticleId?: string | null;
  existingArticleCode?: string | null;
  preserveExistingArticle?: boolean;
};

export async function resolveOrderMasterSnapshots(
  database: Pick<Prisma.TransactionClient, "masterArticle" | "masterArticleVariant">,
  organizationId: string,
  sources: OrderMasterSnapshotSource[],
): Promise<OrderMasterSnapshot[]> {
  const normalizeLabel = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
  const articleNames = [...new Set(sources
    .filter((source) => !(source.preserveExistingArticle && source.existingMasterArticleId))
    .map((source) => source.article?.trim() ?? "")
    .filter(Boolean))];
  const articleIds = [...new Set(sources
    .filter((source) => source.preserveExistingArticle && source.existingMasterArticleId && source.existingArticleCode === null)
    .map((source) => source.existingMasterArticleId as string))];
  const articleConditions = [
    ...articleNames.map((article) => ({
      article: { equals: article, mode: "insensitive" as const },
    })),
    ...(articleIds.length > 0 ? [{ id: { in: articleIds } }] : []),
  ];
  const masterArticles = articleConditions.length > 0
    ? await database.masterArticle.findMany({
        where: {
          organization_id: organizationId,
          OR: articleConditions,
        },
        select: { id: true, article: true, article_code: true },
      })
    : [];
  const articlesByName = new Map<string, typeof masterArticles>();
  const articlesById = new Map(masterArticles.map((article) => [article.id, article]));
  for (const article of masterArticles) {
    const key = normalizeLabel(article.article);
    articlesByName.set(key, [...(articlesByName.get(key) ?? []), article]);
  }

  const resolvedArticles = sources.map((source) => {
    if (source.preserveExistingArticle && source.existingMasterArticleId) {
      return {
        id: source.existingMasterArticleId,
        article_code: source.existingArticleCode ?? articlesById.get(source.existingMasterArticleId)?.article_code ?? null,
      };
    }

    const label = normalizeLabel(source.article);
    if (!label) return null;
    const matches = articlesByName.get(label) ?? [];
    if (matches.length > 1) {
      throw new Error(`The article "${source.article?.trim()}" matches more than one master record. Resolve the duplicate Article master before saving this order.`);
    }
    return matches[0] ?? null;
  });

  const variantPairs = new Map<string, { articleId: string; color: string }>();
  sources.forEach((source, index) => {
    const articleId = resolvedArticles[index]?.id;
    const color = source.colors?.trim() ?? "";
    if (!articleId || !color) return;
    variantPairs.set(`${articleId}\u0000${normalizeLabel(color)}`, { articleId, color });
  });
  const pairs = [...variantPairs.values()];
  const masterVariants = pairs.length > 0
    ? await database.masterArticleVariant.findMany({
        where: {
          organization_id: organizationId,
          OR: pairs.map(({ articleId, color }) => ({
            article_id: articleId,
            color: { is: { colors: { equals: color, mode: "insensitive" } } },
          })),
        },
        select: {
          id: true,
          article_id: true,
          color: { select: { colors: true } },
        },
      })
    : [];
  const variantsByPair = new Map<string, typeof masterVariants>();
  for (const variant of masterVariants) {
    const key = `${variant.article_id}\u0000${normalizeLabel(variant.color.colors)}`;
    variantsByPair.set(key, [...(variantsByPair.get(key) ?? []), variant]);
  }

  return sources.map((source, index) => {
    const article = resolvedArticles[index];
    if (!article) {
      return { articleCode: null, master_article_id: null, master_variant_id: null };
    }
    const colorKey = normalizeLabel(source.colors);
    const matchingVariants = colorKey
      ? variantsByPair.get(`${article.id}\u0000${colorKey}`) ?? []
      : [];
    if (matchingVariants.length > 1) {
      throw new Error(`The colour "${source.colors?.trim()}" matches more than one variant for this article. Resolve the duplicate Article Variant master before saving this order.`);
    }
    return {
      articleCode: article.article_code,
      master_article_id: article.id,
      master_variant_id: matchingVariants[0]?.id ?? null,
    };
  });
}
