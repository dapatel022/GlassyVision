import { fetchWithRetry } from './fetch-with-retry';

const STOREFRONT_API_VERSION = '2025-01';

export async function storefrontFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN!;
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!;

  const response = await fetchWithRetry(
    `https://${domain}/api/${STOREFRONT_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    throw new Error(`Storefront API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors) {
    throw new Error(`Storefront API GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

export const PRODUCTS_QUERY = `
  query Products($first: Int = 50) {
    products(first: $first) {
      edges {
        node {
          id
          handle
          title
          tags
          description
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 10) {
            edges {
              node {
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                sku
                price { amount currencyCode }
                availableForSale
                selectedOptions { name value }
              }
            }
          }
        }
      }
    }
  }
`;

export const PRODUCT_BY_HANDLE_QUERY = `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      title
      tags
      description
      descriptionHtml
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      images(first: 10) {
        edges {
          node {
            url
            altText
            width
            height
          }
        }
      }
      variants(first: 50) {
        edges {
          node {
            id
            title
            sku
            price { amount currencyCode }
            availableForSale
            selectedOptions { name value }
          }
        }
      }
      metafields(identifiers: [
        { namespace: "custom", key: "is_rx_capable" },
        { namespace: "custom", key: "frame_eye_size" },
        { namespace: "custom", key: "frame_bridge" },
        { namespace: "custom", key: "frame_temple_length" }
      ]) {
        key
        value
        namespace
      }
    }
  }
`;

export const CART_CREATE_MUTATION = `
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
        lines(first: 50) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  price { amount currencyCode }
                }
              }
            }
          }
        }
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
          totalTaxAmount { amount currencyCode }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Shared product field selection for catalog queries. Includes the metafields
// the storefront reads for badges and facets.
const PRODUCT_FIELDS = `
  id
  handle
  title
  description
  tags
  priceRange {
    minVariantPrice { amount currencyCode }
  }
  images(first: 10) {
    edges { node { url altText width height } }
  }
  variants(first: 50) {
    edges {
      node {
        id title sku
        price { amount }
        availableForSale
        selectedOptions { name value }
      }
    }
  }
  metafields(identifiers: [
    { namespace: "custom", key: "is_rx_capable" },
    { namespace: "custom", key: "frame_eye_size" },
    { namespace: "custom", key: "frame_bridge" },
    { namespace: "custom", key: "frame_temple_length" },
    { namespace: "custom", key: "polarized" },
    { namespace: "custom", key: "frame_shape" },
    { namespace: "custom", key: "frame_material" },
    { namespace: "custom", key: "lens_intent" },
    { namespace: "custom", key: "gender" }
  ]) { key value namespace }
`;

export const COLLECTIONS_QUERY = `
  query Collections($first: Int = 50) {
    collections(first: $first) {
      edges {
        node {
          id
          handle
          title
          description
          image { url altText width height }
        }
      }
    }
  }
`;

export const COLLECTION_PRODUCTS_QUERY = `
  query CollectionProducts(
    $handle: String!
    $first: Int!
    $after: String
    $filters: [ProductFilter!]
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image { url altText width height }
      products(first: $first, after: $after, filters: $filters, sortKey: $sortKey, reverse: $reverse) {
        filters {
          id
          label
          type
          values { id label count input }
        }
        pageInfo { hasNextPage endCursor }
        edges { node { ${PRODUCT_FIELDS} } }
      }
    }
  }
`;

export const MENU_QUERY = `
  query Menu($handle: String!) {
    menu(handle: $handle) {
      items {
        id
        title
        url
      }
    }
  }
`;

export const HERO_SLIDES_QUERY = `
  query HeroSlides {
    metaobjects(type: "hero_slide", first: 12) {
      edges {
        node {
          fields {
            key
            value
            reference {
              ... on Product {
                handle
                title
                description
                priceRange { minVariantPrice { amount } }
                featuredImage { url }
              }
              ... on MediaImage {
                image { url }
              }
            }
          }
        }
      }
    }
  }
`;

export const HOMEPAGE_QUERY = `
  query Homepage {
    metaobject(handle: { type: "homepage", handle: "main" }) {
      fields {
        key
        value
      }
    }
  }
`;

export const BANNERS_QUERY = `
  query Banners {
    metaobjects(type: "banner", first: 24) {
      edges {
        node {
          fields {
            key
            value
            reference {
              ... on MediaImage {
                image { url }
              }
            }
          }
        }
      }
    }
  }
`;
