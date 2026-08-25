/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { GraphQLClient, type RequestOptions } from 'graphql-request';
import { GraphQLError, print } from 'graphql'
import gql from 'graphql-tag';
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];
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

export type Tone =
  | 'ACCESSIBLE'
  | 'EDUCATIONAL'
  | 'JOURNALISTIC'
  | 'NEUTRAL'
  | 'PROFESSIONAL'
  | 'PROVOCATIVE'
  | 'TECHNICAL';

export type UpdateDomainInput = {
  aiInstructions?: string | null | undefined;
  autoPublish?: boolean | null | undefined;
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

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();
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
export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
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
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;