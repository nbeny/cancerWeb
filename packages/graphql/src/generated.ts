/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { GraphQLClient, type RequestOptions } from 'graphql-request';
import { GraphQLError, print } from 'graphql'
import gql from 'graphql-tag';
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];
export type ArticleFilter = {
  authorId?: string | number | null | undefined;
  categoryId?: string | number | null | undefined;
  minSeoScore?: number | null | undefined;
  publishedAfter?: string | null | undefined;
  publishedBefore?: string | null | undefined;
  search?: string | null | undefined;
  status?: Array<ArticleStatus> | null | undefined;
  tagIds?: Array<string | number> | null | undefined;
};

export type ArticleSort = {
  direction: SortDirection;
  field: ArticleSortField;
};

export type ArticleSortField =
  | 'CREATED_AT'
  | 'PUBLISHED_AT'
  | 'SEO_SCORE'
  | 'TITLE'
  | 'UPDATED_AT';

export type ArticleStatus =
  | 'APPROVED'
  | 'ARCHIVED'
  | 'DRAFT'
  | 'PUBLISHED'
  | 'REVIEW'
  | 'SCHEDULED';

export type CreateArticleInput = {
  canonicalUrl?: string | null | undefined;
  categoryId?: string | number | null | undefined;
  content: string;
  coverImageUrl?: string | null | undefined;
  excerpt?: string | null | undefined;
  focusKeyword?: string | null | undefined;
  metaDescription?: string | null | undefined;
  robotsFollow?: boolean;
  robotsIndex?: boolean;
  secondaryKeywords?: Array<string>;
  seoTitle?: string | null | undefined;
  title: string;
  topicId?: string | number | null | undefined;
};

export type CreateCategoryInput = {
  description?: string | null | undefined;
  name: string;
  parentId?: string | number | null | undefined;
};

export type CreateDomainInput = {
  aiInstructions?: string | null | undefined;
  country?: string | null | undefined;
  description?: string | null | undefined;
  excludedTopics?: Array<string>;
  expertiseLevel?: ExpertiseLevel;
  keywords?: Array<string>;
  language?: string;
  name: string;
  targetAudience?: Array<string>;
  tone?: Tone;
};

export type CreateTagInput = {
  name: string;
};

export type CreateTopicInput = {
  description?: string | null | undefined;
  estimatedDifficulty?: number | null | undefined;
  estimatedInterest?: number | null | undefined;
  keywords?: Array<string>;
  searchIntent?: SearchIntent | null | undefined;
  suggestedAngle?: string | null | undefined;
  title: string;
};

export type DomainRole =
  | 'AUTHOR'
  | 'EDITOR'
  | 'OWNER'
  | 'VIEWER';

export type ExpertiseLevel =
  | 'BEGINNER'
  | 'EXPERT'
  | 'INTERMEDIATE';

export type GlobalRole =
  | 'ADMIN'
  | 'USER';

export type LoginInput = {
  email: string;
  password: string;
};

export type PageInput = {
  limit?: number;
  offset?: number;
};

export type RegisterInput = {
  email: string;
  name: string;
  password: string;
};

export type SearchIntent =
  | 'COMMERCIAL'
  | 'INFORMATIONAL'
  | 'NAVIGATIONAL'
  | 'TRANSACTIONAL';

export type SortDirection =
  | 'ASC'
  | 'DESC';

export type Tone =
  | 'ACCESSIBLE'
  | 'EDUCATIONAL'
  | 'JOURNALISTIC'
  | 'NEUTRAL'
  | 'PROFESSIONAL'
  | 'PROVOCATIVE'
  | 'TECHNICAL';

export type TopicStatus =
  | 'CONVERTED'
  | 'IDEA'
  | 'REJECTED'
  | 'SELECTED';

export type UpdateArticleInput = {
  canonicalUrl?: string | null | undefined;
  categoryId?: string | number | null | undefined;
  content?: string | null | undefined;
  coverImageUrl?: string | null | undefined;
  excerpt?: string | null | undefined;
  focusKeyword?: string | null | undefined;
  metaDescription?: string | null | undefined;
  robotsFollow?: boolean | null | undefined;
  robotsIndex?: boolean | null | undefined;
  secondaryKeywords?: Array<string> | null | undefined;
  seoTitle?: string | null | undefined;
  title?: string | null | undefined;
};

export type UpdateCategoryInput = {
  description?: string | null | undefined;
  name?: string | null | undefined;
  parentId?: string | number | null | undefined;
};

export type UpdateDomainInput = {
  aiInstructions?: string | null | undefined;
  autoPublish?: boolean | null | undefined;
  country?: string | null | undefined;
  description?: string | null | undefined;
  excludedTopics?: Array<string> | null | undefined;
  expertiseLevel?: ExpertiseLevel | null | undefined;
  keywords?: Array<string> | null | undefined;
  language?: string | null | undefined;
  name?: string | null | undefined;
  reviewOutline?: boolean | null | undefined;
  targetAudience?: Array<string> | null | undefined;
  tone?: Tone | null | undefined;
};

export type UpdateTopicInput = {
  description?: string | null | undefined;
  estimatedDifficulty?: number | null | undefined;
  estimatedInterest?: number | null | undefined;
  keywords?: Array<string> | null | undefined;
  searchIntent?: SearchIntent | null | undefined;
  suggestedAngle?: string | null | undefined;
  title?: string | null | undefined;
};

export type ArticleListFieldsFragment = { id: string, title: string, slug: string, status: ArticleStatus, latestSeoScore: number | null, createdAt: string, updatedAt: string, publishedAt: string | null, author: { id: string, name: string }, category: { id: string, name: string } | null };

export type ArticlesQueryVariables = Exact<{
  domainId: string | number;
  filter?: ArticleFilter | null | undefined;
  sort?: ArticleSort | null | undefined;
  page?: PageInput | null | undefined;
}>;


export type ArticlesQuery = { articles: { totalCount: number, items: Array<{ id: string, title: string, slug: string, status: ArticleStatus, latestSeoScore: number | null, createdAt: string, updatedAt: string, publishedAt: string | null, author: { id: string, name: string }, category: { id: string, name: string } | null }> } };

export type CreateArticleMutationVariables = Exact<{
  domainId: string | number;
  input: CreateArticleInput;
}>;


export type CreateArticleMutation = { createArticle: { id: string, title: string, slug: string, status: ArticleStatus } };

export type ArticleCategoriesQueryVariables = Exact<{
  domainId: string | number;
}>;


export type ArticleCategoriesQuery = { categories: Array<{ id: string, name: string, slug: string }> };

export type ArticleTagsQueryVariables = Exact<{
  domainId: string | number;
}>;


export type ArticleTagsQuery = { tags: Array<{ id: string, name: string, slug: string }> };

export type ArticleEditorFieldsFragment = { id: string, domainId: string, title: string, slug: string, status: ArticleStatus, content: string, renderedHtml: string | null, excerpt: string | null, coverImageUrl: string | null, seoTitle: string | null, metaDescription: string | null, focusKeyword: string | null, secondaryKeywords: Array<string>, canonicalUrl: string | null, robotsIndex: boolean, robotsFollow: boolean, latestSeoScore: number | null, currentVersion: number, wordCount: number, topicId: string | null, publishedAt: string | null, scheduledAt: string | null, createdAt: string, updatedAt: string, author: { id: string, name: string }, category: { id: string, name: string } | null, tags: Array<{ id: string, name: string }>, domain: { id: string, myRole: DomainRole } };

export type ArticleStatusFieldsFragment = { id: string, status: ArticleStatus, currentVersion: number, publishedAt: string | null, scheduledAt: string | null, updatedAt: string };

export type ArticleTaxonomyFieldsFragment = { id: string, category: { id: string, name: string } | null, tags: Array<{ id: string, name: string }> };

export type ArticleQueryVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type ArticleQuery = { article: { id: string, domainId: string, title: string, slug: string, status: ArticleStatus, content: string, renderedHtml: string | null, excerpt: string | null, coverImageUrl: string | null, seoTitle: string | null, metaDescription: string | null, focusKeyword: string | null, secondaryKeywords: Array<string>, canonicalUrl: string | null, robotsIndex: boolean, robotsFollow: boolean, latestSeoScore: number | null, currentVersion: number, wordCount: number, topicId: string | null, publishedAt: string | null, scheduledAt: string | null, createdAt: string, updatedAt: string, author: { id: string, name: string }, category: { id: string, name: string } | null, tags: Array<{ id: string, name: string }>, domain: { id: string, myRole: DomainRole } } };

export type UpdateArticleMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
  input: UpdateArticleInput;
}>;


export type UpdateArticleMutation = { updateArticle: { id: string, domainId: string, title: string, slug: string, status: ArticleStatus, content: string, renderedHtml: string | null, excerpt: string | null, coverImageUrl: string | null, seoTitle: string | null, metaDescription: string | null, focusKeyword: string | null, secondaryKeywords: Array<string>, canonicalUrl: string | null, robotsIndex: boolean, robotsFollow: boolean, latestSeoScore: number | null, currentVersion: number, wordCount: number, topicId: string | null, publishedAt: string | null, scheduledAt: string | null, createdAt: string, updatedAt: string, author: { id: string, name: string }, category: { id: string, name: string } | null, tags: Array<{ id: string, name: string }>, domain: { id: string, myRole: DomainRole } } };

export type SetArticleCategoryMutationVariables = Exact<{
  domainId: string | number;
  articleId: string | number;
  categoryId?: string | number | null | undefined;
}>;


export type SetArticleCategoryMutation = { setArticleCategory: { id: string, category: { id: string, name: string } | null, tags: Array<{ id: string, name: string }> } };

export type SetArticleTagsMutationVariables = Exact<{
  domainId: string | number;
  articleId: string | number;
  tagIds: Array<string | number> | string | number;
}>;


export type SetArticleTagsMutation = { setArticleTags: { id: string, category: { id: string, name: string } | null, tags: Array<{ id: string, name: string }> } };

export type SubmitForReviewMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type SubmitForReviewMutation = { submitForReview: { id: string, status: ArticleStatus, currentVersion: number, publishedAt: string | null, scheduledAt: string | null, updatedAt: string } };

export type ApproveArticleMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type ApproveArticleMutation = { approveArticle: { id: string, status: ArticleStatus, currentVersion: number, publishedAt: string | null, scheduledAt: string | null, updatedAt: string } };

export type RejectArticleMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type RejectArticleMutation = { rejectArticle: { id: string, status: ArticleStatus, currentVersion: number, publishedAt: string | null, scheduledAt: string | null, updatedAt: string } };

export type PublishArticleMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type PublishArticleMutation = { publishArticle: { id: string, status: ArticleStatus, currentVersion: number, publishedAt: string | null, scheduledAt: string | null, updatedAt: string } };

export type ScheduleArticleMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
  scheduledAt: string;
}>;


export type ScheduleArticleMutation = { scheduleArticle: { id: string, status: ArticleStatus, currentVersion: number, publishedAt: string | null, scheduledAt: string | null, updatedAt: string } };

export type ArchiveArticleMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type ArchiveArticleMutation = { archiveArticle: { id: string, status: ArticleStatus, currentVersion: number, publishedAt: string | null, scheduledAt: string | null, updatedAt: string } };

export type ArticleVersionsQueryVariables = Exact<{
  domainId: string | number;
  articleId: string | number;
}>;


export type ArticleVersionsQuery = { articleVersions: Array<{ id: string, version: number, title: string, content: string, changeNote: string | null, createdAt: string, createdById: string }> };

export type CreateArticleVersionMutationVariables = Exact<{
  domainId: string | number;
  articleId: string | number;
  changeNote?: string | null | undefined;
}>;


export type CreateArticleVersionMutation = { createArticleVersion: { id: string, version: number, title: string, content: string, changeNote: string | null, createdAt: string, createdById: string } };

export type RestoreArticleVersionMutationVariables = Exact<{
  domainId: string | number;
  articleId: string | number;
  version: number;
}>;


export type RestoreArticleVersionMutation = { restoreArticleVersion: { id: string, domainId: string, title: string, slug: string, status: ArticleStatus, content: string, renderedHtml: string | null, excerpt: string | null, coverImageUrl: string | null, seoTitle: string | null, metaDescription: string | null, focusKeyword: string | null, secondaryKeywords: Array<string>, canonicalUrl: string | null, robotsIndex: boolean, robotsFollow: boolean, latestSeoScore: number | null, currentVersion: number, wordCount: number, topicId: string | null, publishedAt: string | null, scheduledAt: string | null, createdAt: string, updatedAt: string, author: { id: string, name: string }, category: { id: string, name: string } | null, tags: Array<{ id: string, name: string }>, domain: { id: string, myRole: DomainRole } } };

export type LoginMutationVariables = Exact<{
  input: LoginInput;
}>;


export type LoginMutation = { login: { user: { id: string, email: string, name: string, slug: string, globalRole: GlobalRole } } };

export type RegisterMutationVariables = Exact<{
  input: RegisterInput;
}>;


export type RegisterMutation = { register: { user: { id: string, email: string, name: string, slug: string, globalRole: GlobalRole } } };

export type RefreshMutationVariables = Exact<{ [key: string]: never; }>;


export type RefreshMutation = { refresh: { user: { id: string, email: string } } };

export type LogoutMutationVariables = Exact<{ [key: string]: never; }>;


export type LogoutMutation = { logout: boolean };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { me: { id: string, email: string, name: string, slug: string, globalRole: GlobalRole, createdAt: string } };

export type DomainFieldsFragment = { id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string, myRole: DomainRole };

export type DomainsQueryVariables = Exact<{
  page?: PageInput | null | undefined;
}>;


export type DomainsQuery = { domains: { totalCount: number, items: Array<{ id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string, myRole: DomainRole }> } };

export type DomainByIdQueryVariables = Exact<{
  id: string | number;
}>;


export type DomainByIdQuery = { domain: { id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string, myRole: DomainRole } };

export type CreateDomainMutationVariables = Exact<{
  input: CreateDomainInput;
}>;


export type CreateDomainMutation = { createDomain: { id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string, myRole: DomainRole } };

export type UpdateDomainMutationVariables = Exact<{
  id: string | number;
  input: UpdateDomainInput;
}>;


export type UpdateDomainMutation = { updateDomain: { id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string, myRole: DomainRole } };

export type DeleteDomainMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteDomainMutation = { deleteDomain: boolean };

export type SeoReportFieldsFragment = { id: string, articleId: string, score: number, cappedBy: Array<string>, computedAt: string, metrics: unknown, issues: Array<{ code: string, severity: string, message: string, field: string | null }> };

export type AnalyzeSeoMutationVariables = Exact<{
  domainId: string | number;
  articleId: string | number;
}>;


export type AnalyzeSeoMutation = { analyzeSeo: { id: string, articleId: string, score: number, cappedBy: Array<string>, computedAt: string, metrics: unknown, issues: Array<{ code: string, severity: string, message: string, field: string | null }> } };

export type SeoReportsQueryVariables = Exact<{
  domainId: string | number;
  articleId: string | number;
  page?: PageInput | null | undefined;
}>;


export type SeoReportsQuery = { seoReports: { totalCount: number, items: Array<{ id: string, articleId: string, score: number, cappedBy: Array<string>, computedAt: string, metrics: unknown, issues: Array<{ code: string, severity: string, message: string, field: string | null }> }> } };

export type CategoryFieldsFragment = { id: string, domainId: string, name: string, slug: string, description: string | null, parentId: string | null, articleCount: number };

export type TagFieldsFragment = { id: string, domainId: string, name: string, slug: string };

export type CategoriesQueryVariables = Exact<{
  domainId: string | number;
}>;


export type CategoriesQuery = { categories: Array<{ id: string, domainId: string, name: string, slug: string, description: string | null, parentId: string | null, articleCount: number }> };

export type CreateCategoryMutationVariables = Exact<{
  domainId: string | number;
  input: CreateCategoryInput;
}>;


export type CreateCategoryMutation = { createCategory: { id: string, domainId: string, name: string, slug: string, description: string | null, parentId: string | null, articleCount: number } };

export type UpdateCategoryMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
  input: UpdateCategoryInput;
}>;


export type UpdateCategoryMutation = { updateCategory: { id: string, domainId: string, name: string, slug: string, description: string | null, parentId: string | null, articleCount: number } };

export type DeleteCategoryMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type DeleteCategoryMutation = { deleteCategory: boolean };

export type TagsQueryVariables = Exact<{
  domainId: string | number;
}>;


export type TagsQuery = { tags: Array<{ id: string, domainId: string, name: string, slug: string }> };

export type CreateTagMutationVariables = Exact<{
  domainId: string | number;
  input: CreateTagInput;
}>;


export type CreateTagMutation = { createTag: { id: string, domainId: string, name: string, slug: string } };

export type DeleteTagMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type DeleteTagMutation = { deleteTag: boolean };

export type TopicFieldsFragment = { id: string, domainId: string, title: string, description: string | null, status: TopicStatus, estimatedDifficulty: number | null, estimatedInterest: number | null, keywords: Array<string>, searchIntent: SearchIntent | null, suggestedAngle: string | null, generatedByJobId: string | null, createdAt: string, updatedAt: string };

export type TopicsQueryVariables = Exact<{
  domainId: string | number;
  page?: PageInput | null | undefined;
  status?: TopicStatus | null | undefined;
}>;


export type TopicsQuery = { topics: { totalCount: number, items: Array<{ id: string, domainId: string, title: string, description: string | null, status: TopicStatus, estimatedDifficulty: number | null, estimatedInterest: number | null, keywords: Array<string>, searchIntent: SearchIntent | null, suggestedAngle: string | null, generatedByJobId: string | null, createdAt: string, updatedAt: string }> } };

export type TopicByIdQueryVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type TopicByIdQuery = { topic: { id: string, domainId: string, title: string, description: string | null, status: TopicStatus, estimatedDifficulty: number | null, estimatedInterest: number | null, keywords: Array<string>, searchIntent: SearchIntent | null, suggestedAngle: string | null, generatedByJobId: string | null, createdAt: string, updatedAt: string } };

export type CreateTopicMutationVariables = Exact<{
  domainId: string | number;
  input: CreateTopicInput;
}>;


export type CreateTopicMutation = { createTopic: { id: string, domainId: string, title: string, description: string | null, status: TopicStatus, estimatedDifficulty: number | null, estimatedInterest: number | null, keywords: Array<string>, searchIntent: SearchIntent | null, suggestedAngle: string | null, generatedByJobId: string | null, createdAt: string, updatedAt: string } };

export type UpdateTopicMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
  input: UpdateTopicInput;
}>;


export type UpdateTopicMutation = { updateTopic: { id: string, domainId: string, title: string, description: string | null, status: TopicStatus, estimatedDifficulty: number | null, estimatedInterest: number | null, keywords: Array<string>, searchIntent: SearchIntent | null, suggestedAngle: string | null, generatedByJobId: string | null, createdAt: string, updatedAt: string } };

export type SelectTopicMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type SelectTopicMutation = { selectTopic: { id: string, domainId: string, title: string, description: string | null, status: TopicStatus, estimatedDifficulty: number | null, estimatedInterest: number | null, keywords: Array<string>, searchIntent: SearchIntent | null, suggestedAngle: string | null, generatedByJobId: string | null, createdAt: string, updatedAt: string } };

export type RejectTopicMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type RejectTopicMutation = { rejectTopic: { id: string, domainId: string, title: string, description: string | null, status: TopicStatus, estimatedDifficulty: number | null, estimatedInterest: number | null, keywords: Array<string>, searchIntent: SearchIntent | null, suggestedAngle: string | null, generatedByJobId: string | null, createdAt: string, updatedAt: string } };

export type DeleteTopicMutationVariables = Exact<{
  domainId: string | number;
  id: string | number;
}>;


export type DeleteTopicMutation = { deleteTopic: boolean };

export const ArticleListFieldsFragmentDoc = gql`
    fragment ArticleListFields on Article {
  id
  title
  slug
  status
  latestSeoScore
  createdAt
  updatedAt
  publishedAt
  author {
    id
    name
  }
  category {
    id
    name
  }
}
    `;
export const ArticleEditorFieldsFragmentDoc = gql`
    fragment ArticleEditorFields on Article {
  id
  domainId
  title
  slug
  status
  content
  renderedHtml
  excerpt
  coverImageUrl
  seoTitle
  metaDescription
  focusKeyword
  secondaryKeywords
  canonicalUrl
  robotsIndex
  robotsFollow
  latestSeoScore
  currentVersion
  wordCount
  topicId
  publishedAt
  scheduledAt
  createdAt
  updatedAt
  author {
    id
    name
  }
  category {
    id
    name
  }
  tags {
    id
    name
  }
  domain {
    id
    myRole
  }
}
    `;
export const ArticleStatusFieldsFragmentDoc = gql`
    fragment ArticleStatusFields on Article {
  id
  status
  currentVersion
  publishedAt
  scheduledAt
  updatedAt
}
    `;
export const ArticleTaxonomyFieldsFragmentDoc = gql`
    fragment ArticleTaxonomyFields on Article {
  id
  category {
    id
    name
  }
  tags {
    id
    name
  }
}
    `;
export const DomainFieldsFragmentDoc = gql`
    fragment DomainFields on Domain {
  id
  name
  slug
  description
  language
  country
  tone
  expertiseLevel
  targetAudience
  keywords
  excludedTopics
  aiInstructions
  autoPublish
  reviewOutline
  createdAt
  updatedAt
  myRole
}
    `;
export const SeoReportFieldsFragmentDoc = gql`
    fragment SeoReportFields on SeoReport {
  id
  articleId
  score
  cappedBy
  computedAt
  issues {
    code
    severity
    message
    field
  }
  metrics
}
    `;
export const CategoryFieldsFragmentDoc = gql`
    fragment CategoryFields on Category {
  id
  domainId
  name
  slug
  description
  parentId
  articleCount
}
    `;
export const TagFieldsFragmentDoc = gql`
    fragment TagFields on Tag {
  id
  domainId
  name
  slug
}
    `;
export const TopicFieldsFragmentDoc = gql`
    fragment TopicFields on Topic {
  id
  domainId
  title
  description
  status
  estimatedDifficulty
  estimatedInterest
  keywords
  searchIntent
  suggestedAngle
  generatedByJobId
  createdAt
  updatedAt
}
    `;
export const ArticlesDocument = gql`
    query Articles($domainId: ID!, $filter: ArticleFilter, $sort: ArticleSort, $page: PageInput) {
  articles(domainId: $domainId, filter: $filter, sort: $sort, page: $page) {
    items {
      ...ArticleListFields
    }
    totalCount
  }
}
    ${ArticleListFieldsFragmentDoc}`;
export const CreateArticleDocument = gql`
    mutation CreateArticle($domainId: ID!, $input: CreateArticleInput!) {
  createArticle(domainId: $domainId, input: $input) {
    id
    title
    slug
    status
  }
}
    `;
export const ArticleCategoriesDocument = gql`
    query ArticleCategories($domainId: ID!) {
  categories(domainId: $domainId) {
    id
    name
    slug
  }
}
    `;
export const ArticleTagsDocument = gql`
    query ArticleTags($domainId: ID!) {
  tags(domainId: $domainId) {
    id
    name
    slug
  }
}
    `;
export const ArticleDocument = gql`
    query Article($domainId: ID!, $id: ID!) {
  article(domainId: $domainId, id: $id) {
    ...ArticleEditorFields
  }
}
    ${ArticleEditorFieldsFragmentDoc}`;
export const UpdateArticleDocument = gql`
    mutation UpdateArticle($domainId: ID!, $id: ID!, $input: UpdateArticleInput!) {
  updateArticle(domainId: $domainId, id: $id, input: $input) {
    ...ArticleEditorFields
  }
}
    ${ArticleEditorFieldsFragmentDoc}`;
export const SetArticleCategoryDocument = gql`
    mutation SetArticleCategory($domainId: ID!, $articleId: ID!, $categoryId: ID) {
  setArticleCategory(
    domainId: $domainId
    articleId: $articleId
    categoryId: $categoryId
  ) {
    ...ArticleTaxonomyFields
  }
}
    ${ArticleTaxonomyFieldsFragmentDoc}`;
export const SetArticleTagsDocument = gql`
    mutation SetArticleTags($domainId: ID!, $articleId: ID!, $tagIds: [ID!]!) {
  setArticleTags(domainId: $domainId, articleId: $articleId, tagIds: $tagIds) {
    ...ArticleTaxonomyFields
  }
}
    ${ArticleTaxonomyFieldsFragmentDoc}`;
export const SubmitForReviewDocument = gql`
    mutation SubmitForReview($domainId: ID!, $id: ID!) {
  submitForReview(domainId: $domainId, id: $id) {
    ...ArticleStatusFields
  }
}
    ${ArticleStatusFieldsFragmentDoc}`;
export const ApproveArticleDocument = gql`
    mutation ApproveArticle($domainId: ID!, $id: ID!) {
  approveArticle(domainId: $domainId, id: $id) {
    ...ArticleStatusFields
  }
}
    ${ArticleStatusFieldsFragmentDoc}`;
export const RejectArticleDocument = gql`
    mutation RejectArticle($domainId: ID!, $id: ID!) {
  rejectArticle(domainId: $domainId, id: $id) {
    ...ArticleStatusFields
  }
}
    ${ArticleStatusFieldsFragmentDoc}`;
export const PublishArticleDocument = gql`
    mutation PublishArticle($domainId: ID!, $id: ID!) {
  publishArticle(domainId: $domainId, id: $id) {
    ...ArticleStatusFields
  }
}
    ${ArticleStatusFieldsFragmentDoc}`;
export const ScheduleArticleDocument = gql`
    mutation ScheduleArticle($domainId: ID!, $id: ID!, $scheduledAt: DateTime!) {
  scheduleArticle(domainId: $domainId, id: $id, scheduledAt: $scheduledAt) {
    ...ArticleStatusFields
  }
}
    ${ArticleStatusFieldsFragmentDoc}`;
export const ArchiveArticleDocument = gql`
    mutation ArchiveArticle($domainId: ID!, $id: ID!) {
  archiveArticle(domainId: $domainId, id: $id) {
    ...ArticleStatusFields
  }
}
    ${ArticleStatusFieldsFragmentDoc}`;
export const ArticleVersionsDocument = gql`
    query ArticleVersions($domainId: ID!, $articleId: ID!) {
  articleVersions(domainId: $domainId, articleId: $articleId) {
    id
    version
    title
    content
    changeNote
    createdAt
    createdById
  }
}
    `;
export const CreateArticleVersionDocument = gql`
    mutation CreateArticleVersion($domainId: ID!, $articleId: ID!, $changeNote: String) {
  createArticleVersion(
    domainId: $domainId
    articleId: $articleId
    changeNote: $changeNote
  ) {
    id
    version
    title
    content
    changeNote
    createdAt
    createdById
  }
}
    `;
export const RestoreArticleVersionDocument = gql`
    mutation RestoreArticleVersion($domainId: ID!, $articleId: ID!, $version: Int!) {
  restoreArticleVersion(
    domainId: $domainId
    articleId: $articleId
    version: $version
  ) {
    ...ArticleEditorFields
  }
}
    ${ArticleEditorFieldsFragmentDoc}`;
export const LoginDocument = gql`
    mutation Login($input: LoginInput!) {
  login(input: $input) {
    user {
      id
      email
      name
      slug
      globalRole
    }
  }
}
    `;
export const RegisterDocument = gql`
    mutation Register($input: RegisterInput!) {
  register(input: $input) {
    user {
      id
      email
      name
      slug
      globalRole
    }
  }
}
    `;
export const RefreshDocument = gql`
    mutation Refresh {
  refresh {
    user {
      id
      email
    }
  }
}
    `;
export const LogoutDocument = gql`
    mutation Logout {
  logout
}
    `;
export const MeDocument = gql`
    query Me {
  me {
    id
    email
    name
    slug
    globalRole
    createdAt
  }
}
    `;
export const DomainsDocument = gql`
    query Domains($page: PageInput) {
  domains(page: $page) {
    items {
      ...DomainFields
    }
    totalCount
  }
}
    ${DomainFieldsFragmentDoc}`;
export const DomainByIdDocument = gql`
    query DomainById($id: ID!) {
  domain(id: $id) {
    ...DomainFields
  }
}
    ${DomainFieldsFragmentDoc}`;
export const CreateDomainDocument = gql`
    mutation CreateDomain($input: CreateDomainInput!) {
  createDomain(input: $input) {
    ...DomainFields
  }
}
    ${DomainFieldsFragmentDoc}`;
export const UpdateDomainDocument = gql`
    mutation UpdateDomain($id: ID!, $input: UpdateDomainInput!) {
  updateDomain(id: $id, input: $input) {
    ...DomainFields
  }
}
    ${DomainFieldsFragmentDoc}`;
export const DeleteDomainDocument = gql`
    mutation DeleteDomain($id: ID!) {
  deleteDomain(id: $id)
}
    `;
export const AnalyzeSeoDocument = gql`
    mutation AnalyzeSeo($domainId: ID!, $articleId: ID!) {
  analyzeSeo(domainId: $domainId, articleId: $articleId) {
    ...SeoReportFields
  }
}
    ${SeoReportFieldsFragmentDoc}`;
export const SeoReportsDocument = gql`
    query SeoReports($domainId: ID!, $articleId: ID!, $page: PageInput) {
  seoReports(domainId: $domainId, articleId: $articleId, page: $page) {
    items {
      ...SeoReportFields
    }
    totalCount
  }
}
    ${SeoReportFieldsFragmentDoc}`;
export const CategoriesDocument = gql`
    query Categories($domainId: ID!) {
  categories(domainId: $domainId) {
    ...CategoryFields
  }
}
    ${CategoryFieldsFragmentDoc}`;
export const CreateCategoryDocument = gql`
    mutation CreateCategory($domainId: ID!, $input: CreateCategoryInput!) {
  createCategory(domainId: $domainId, input: $input) {
    ...CategoryFields
  }
}
    ${CategoryFieldsFragmentDoc}`;
export const UpdateCategoryDocument = gql`
    mutation UpdateCategory($domainId: ID!, $id: ID!, $input: UpdateCategoryInput!) {
  updateCategory(domainId: $domainId, id: $id, input: $input) {
    ...CategoryFields
  }
}
    ${CategoryFieldsFragmentDoc}`;
export const DeleteCategoryDocument = gql`
    mutation DeleteCategory($domainId: ID!, $id: ID!) {
  deleteCategory(domainId: $domainId, id: $id)
}
    `;
export const TagsDocument = gql`
    query Tags($domainId: ID!) {
  tags(domainId: $domainId) {
    ...TagFields
  }
}
    ${TagFieldsFragmentDoc}`;
export const CreateTagDocument = gql`
    mutation CreateTag($domainId: ID!, $input: CreateTagInput!) {
  createTag(domainId: $domainId, input: $input) {
    ...TagFields
  }
}
    ${TagFieldsFragmentDoc}`;
export const DeleteTagDocument = gql`
    mutation DeleteTag($domainId: ID!, $id: ID!) {
  deleteTag(domainId: $domainId, id: $id)
}
    `;
export const TopicsDocument = gql`
    query Topics($domainId: ID!, $page: PageInput, $status: TopicStatus) {
  topics(domainId: $domainId, page: $page, status: $status) {
    items {
      ...TopicFields
    }
    totalCount
  }
}
    ${TopicFieldsFragmentDoc}`;
export const TopicByIdDocument = gql`
    query TopicById($domainId: ID!, $id: ID!) {
  topic(domainId: $domainId, id: $id) {
    ...TopicFields
  }
}
    ${TopicFieldsFragmentDoc}`;
export const CreateTopicDocument = gql`
    mutation CreateTopic($domainId: ID!, $input: CreateTopicInput!) {
  createTopic(domainId: $domainId, input: $input) {
    ...TopicFields
  }
}
    ${TopicFieldsFragmentDoc}`;
export const UpdateTopicDocument = gql`
    mutation UpdateTopic($domainId: ID!, $id: ID!, $input: UpdateTopicInput!) {
  updateTopic(domainId: $domainId, id: $id, input: $input) {
    ...TopicFields
  }
}
    ${TopicFieldsFragmentDoc}`;
export const SelectTopicDocument = gql`
    mutation SelectTopic($domainId: ID!, $id: ID!) {
  selectTopic(domainId: $domainId, id: $id) {
    ...TopicFields
  }
}
    ${TopicFieldsFragmentDoc}`;
export const RejectTopicDocument = gql`
    mutation RejectTopic($domainId: ID!, $id: ID!) {
  rejectTopic(domainId: $domainId, id: $id) {
    ...TopicFields
  }
}
    ${TopicFieldsFragmentDoc}`;
export const DeleteTopicDocument = gql`
    mutation DeleteTopic($domainId: ID!, $id: ID!) {
  deleteTopic(domainId: $domainId, id: $id)
}
    `;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();
const ArticlesDocumentString = print(ArticlesDocument);
const CreateArticleDocumentString = print(CreateArticleDocument);
const ArticleCategoriesDocumentString = print(ArticleCategoriesDocument);
const ArticleTagsDocumentString = print(ArticleTagsDocument);
const ArticleDocumentString = print(ArticleDocument);
const UpdateArticleDocumentString = print(UpdateArticleDocument);
const SetArticleCategoryDocumentString = print(SetArticleCategoryDocument);
const SetArticleTagsDocumentString = print(SetArticleTagsDocument);
const SubmitForReviewDocumentString = print(SubmitForReviewDocument);
const ApproveArticleDocumentString = print(ApproveArticleDocument);
const RejectArticleDocumentString = print(RejectArticleDocument);
const PublishArticleDocumentString = print(PublishArticleDocument);
const ScheduleArticleDocumentString = print(ScheduleArticleDocument);
const ArchiveArticleDocumentString = print(ArchiveArticleDocument);
const ArticleVersionsDocumentString = print(ArticleVersionsDocument);
const CreateArticleVersionDocumentString = print(CreateArticleVersionDocument);
const RestoreArticleVersionDocumentString = print(RestoreArticleVersionDocument);
const LoginDocumentString = print(LoginDocument);
const RegisterDocumentString = print(RegisterDocument);
const RefreshDocumentString = print(RefreshDocument);
const LogoutDocumentString = print(LogoutDocument);
const MeDocumentString = print(MeDocument);
const DomainsDocumentString = print(DomainsDocument);
const DomainByIdDocumentString = print(DomainByIdDocument);
const CreateDomainDocumentString = print(CreateDomainDocument);
const UpdateDomainDocumentString = print(UpdateDomainDocument);
const DeleteDomainDocumentString = print(DeleteDomainDocument);
const AnalyzeSeoDocumentString = print(AnalyzeSeoDocument);
const SeoReportsDocumentString = print(SeoReportsDocument);
const CategoriesDocumentString = print(CategoriesDocument);
const CreateCategoryDocumentString = print(CreateCategoryDocument);
const UpdateCategoryDocumentString = print(UpdateCategoryDocument);
const DeleteCategoryDocumentString = print(DeleteCategoryDocument);
const TagsDocumentString = print(TagsDocument);
const CreateTagDocumentString = print(CreateTagDocument);
const DeleteTagDocumentString = print(DeleteTagDocument);
const TopicsDocumentString = print(TopicsDocument);
const TopicByIdDocumentString = print(TopicByIdDocument);
const CreateTopicDocumentString = print(CreateTopicDocument);
const UpdateTopicDocumentString = print(UpdateTopicDocument);
const SelectTopicDocumentString = print(SelectTopicDocument);
const RejectTopicDocumentString = print(RejectTopicDocument);
const DeleteTopicDocumentString = print(DeleteTopicDocument);
export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    Articles(variables: ArticlesQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: ArticlesQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<ArticlesQuery>(ArticlesDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Articles', 'query', variables);
    },
    CreateArticle(variables: CreateArticleMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: CreateArticleMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<CreateArticleMutation>(CreateArticleDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'CreateArticle', 'mutation', variables);
    },
    ArticleCategories(variables: ArticleCategoriesQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: ArticleCategoriesQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<ArticleCategoriesQuery>(ArticleCategoriesDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'ArticleCategories', 'query', variables);
    },
    ArticleTags(variables: ArticleTagsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: ArticleTagsQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<ArticleTagsQuery>(ArticleTagsDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'ArticleTags', 'query', variables);
    },
    Article(variables: ArticleQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: ArticleQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<ArticleQuery>(ArticleDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Article', 'query', variables);
    },
    UpdateArticle(variables: UpdateArticleMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: UpdateArticleMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<UpdateArticleMutation>(UpdateArticleDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'UpdateArticle', 'mutation', variables);
    },
    SetArticleCategory(variables: SetArticleCategoryMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: SetArticleCategoryMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<SetArticleCategoryMutation>(SetArticleCategoryDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'SetArticleCategory', 'mutation', variables);
    },
    SetArticleTags(variables: SetArticleTagsMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: SetArticleTagsMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<SetArticleTagsMutation>(SetArticleTagsDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'SetArticleTags', 'mutation', variables);
    },
    SubmitForReview(variables: SubmitForReviewMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: SubmitForReviewMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<SubmitForReviewMutation>(SubmitForReviewDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'SubmitForReview', 'mutation', variables);
    },
    ApproveArticle(variables: ApproveArticleMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: ApproveArticleMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<ApproveArticleMutation>(ApproveArticleDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'ApproveArticle', 'mutation', variables);
    },
    RejectArticle(variables: RejectArticleMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: RejectArticleMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<RejectArticleMutation>(RejectArticleDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'RejectArticle', 'mutation', variables);
    },
    PublishArticle(variables: PublishArticleMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: PublishArticleMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<PublishArticleMutation>(PublishArticleDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'PublishArticle', 'mutation', variables);
    },
    ScheduleArticle(variables: ScheduleArticleMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: ScheduleArticleMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<ScheduleArticleMutation>(ScheduleArticleDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'ScheduleArticle', 'mutation', variables);
    },
    ArchiveArticle(variables: ArchiveArticleMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: ArchiveArticleMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<ArchiveArticleMutation>(ArchiveArticleDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'ArchiveArticle', 'mutation', variables);
    },
    ArticleVersions(variables: ArticleVersionsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: ArticleVersionsQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<ArticleVersionsQuery>(ArticleVersionsDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'ArticleVersions', 'query', variables);
    },
    CreateArticleVersion(variables: CreateArticleVersionMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: CreateArticleVersionMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<CreateArticleVersionMutation>(CreateArticleVersionDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'CreateArticleVersion', 'mutation', variables);
    },
    RestoreArticleVersion(variables: RestoreArticleVersionMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: RestoreArticleVersionMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<RestoreArticleVersionMutation>(RestoreArticleVersionDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'RestoreArticleVersion', 'mutation', variables);
    },
    Login(variables: LoginMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: LoginMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<LoginMutation>(LoginDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Login', 'mutation', variables);
    },
    Register(variables: RegisterMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: RegisterMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<RegisterMutation>(RegisterDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Register', 'mutation', variables);
    },
    Refresh(variables?: RefreshMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: RefreshMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<RefreshMutation>(RefreshDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Refresh', 'mutation', variables);
    },
    Logout(variables?: LogoutMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: LogoutMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<LogoutMutation>(LogoutDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Logout', 'mutation', variables);
    },
    Me(variables?: MeQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: MeQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<MeQuery>(MeDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Me', 'query', variables);
    },
    Domains(variables?: DomainsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: DomainsQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<DomainsQuery>(DomainsDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Domains', 'query', variables);
    },
    DomainById(variables: DomainByIdQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: DomainByIdQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<DomainByIdQuery>(DomainByIdDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'DomainById', 'query', variables);
    },
    CreateDomain(variables: CreateDomainMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: CreateDomainMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<CreateDomainMutation>(CreateDomainDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'CreateDomain', 'mutation', variables);
    },
    UpdateDomain(variables: UpdateDomainMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: UpdateDomainMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<UpdateDomainMutation>(UpdateDomainDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'UpdateDomain', 'mutation', variables);
    },
    DeleteDomain(variables: DeleteDomainMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: DeleteDomainMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<DeleteDomainMutation>(DeleteDomainDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'DeleteDomain', 'mutation', variables);
    },
    AnalyzeSeo(variables: AnalyzeSeoMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: AnalyzeSeoMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<AnalyzeSeoMutation>(AnalyzeSeoDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'AnalyzeSeo', 'mutation', variables);
    },
    SeoReports(variables: SeoReportsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: SeoReportsQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<SeoReportsQuery>(SeoReportsDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'SeoReports', 'query', variables);
    },
    Categories(variables: CategoriesQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: CategoriesQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<CategoriesQuery>(CategoriesDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Categories', 'query', variables);
    },
    CreateCategory(variables: CreateCategoryMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: CreateCategoryMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<CreateCategoryMutation>(CreateCategoryDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'CreateCategory', 'mutation', variables);
    },
    UpdateCategory(variables: UpdateCategoryMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: UpdateCategoryMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<UpdateCategoryMutation>(UpdateCategoryDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'UpdateCategory', 'mutation', variables);
    },
    DeleteCategory(variables: DeleteCategoryMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: DeleteCategoryMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<DeleteCategoryMutation>(DeleteCategoryDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'DeleteCategory', 'mutation', variables);
    },
    Tags(variables: TagsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: TagsQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<TagsQuery>(TagsDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Tags', 'query', variables);
    },
    CreateTag(variables: CreateTagMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: CreateTagMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<CreateTagMutation>(CreateTagDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'CreateTag', 'mutation', variables);
    },
    DeleteTag(variables: DeleteTagMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: DeleteTagMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<DeleteTagMutation>(DeleteTagDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'DeleteTag', 'mutation', variables);
    },
    Topics(variables: TopicsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: TopicsQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<TopicsQuery>(TopicsDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'Topics', 'query', variables);
    },
    TopicById(variables: TopicByIdQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: TopicByIdQuery; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<TopicByIdQuery>(TopicByIdDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'TopicById', 'query', variables);
    },
    CreateTopic(variables: CreateTopicMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: CreateTopicMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<CreateTopicMutation>(CreateTopicDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'CreateTopic', 'mutation', variables);
    },
    UpdateTopic(variables: UpdateTopicMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: UpdateTopicMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<UpdateTopicMutation>(UpdateTopicDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'UpdateTopic', 'mutation', variables);
    },
    SelectTopic(variables: SelectTopicMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: SelectTopicMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<SelectTopicMutation>(SelectTopicDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'SelectTopic', 'mutation', variables);
    },
    RejectTopic(variables: RejectTopicMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: RejectTopicMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<RejectTopicMutation>(RejectTopicDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'RejectTopic', 'mutation', variables);
    },
    DeleteTopic(variables: DeleteTopicMutationVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<{ data: DeleteTopicMutation; errors?: GraphQLError[]; extensions?: any; headers: Headers; status: number; }> {
        return withWrapper((wrappedRequestHeaders) => client.rawRequest<DeleteTopicMutation>(DeleteTopicDocumentString, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'DeleteTopic', 'mutation', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;