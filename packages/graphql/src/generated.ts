/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { GraphQLClient, type RequestOptions } from 'graphql-request';
import { GraphQLError, print } from 'graphql'
import gql from 'graphql-tag';
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];
export type ArticleFilter = {
  search?: string | null | undefined;
};

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

export type CreateTopicInput = {
  description?: string | null | undefined;
  estimatedDifficulty?: number | null | undefined;
  estimatedInterest?: number | null | undefined;
  keywords?: Array<string>;
  searchIntent?: SearchIntent | null | undefined;
  suggestedAngle?: string | null | undefined;
  title: string;
};

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

export type DomainFieldsFragment = { id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string };

export type DomainsQueryVariables = Exact<{
  page?: PageInput | null | undefined;
}>;


export type DomainsQuery = { domains: { totalCount: number, items: Array<{ id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string }> } };

export type DomainByIdQueryVariables = Exact<{
  id: string | number;
}>;


export type DomainByIdQuery = { domain: { id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string } };

export type CreateDomainMutationVariables = Exact<{
  input: CreateDomainInput;
}>;


export type CreateDomainMutation = { createDomain: { id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string } };

export type UpdateDomainMutationVariables = Exact<{
  id: string | number;
  input: UpdateDomainInput;
}>;


export type UpdateDomainMutation = { updateDomain: { id: string, name: string, slug: string, description: string | null, language: string, country: string | null, tone: Tone, expertiseLevel: ExpertiseLevel, targetAudience: Array<string>, keywords: Array<string>, excludedTopics: Array<string>, aiInstructions: string | null, autoPublish: boolean, reviewOutline: boolean, createdAt: string, updatedAt: string } };

export type DeleteDomainMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteDomainMutation = { deleteDomain: boolean };

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
    query Articles($domainId: ID!, $filter: ArticleFilter, $page: PageInput) {
  articles(domainId: $domainId, filter: $filter, page: $page) {
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