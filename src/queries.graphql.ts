
import { gql } from "graphql-request";

export const exampleQuery = gql`
  query GetBoards($ids: [ID!]) {
    boards(ids: $ids) {
      id
      name
    }
  }
`;

export const exampleMutation = gql`
  mutation CreateItem($boardId: ID!, $groupId: String!, $itemName: String!) {
    create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName) {
      id
      name
    }
  }
`;

export const getColumnValueQuery = gql`query GetColumnValue($itemId: [ID!], $columnId: [String!]) {
        items (ids: $itemId) {
          column_values(ids:$columnId) {
            value
            text
            ... on MirrorValue {
              display_value
            }
          }
        }
      }`;

export const getBoardColumnsQuery = gql`
  query GetBoardColumns($boardId: [ID!]) {
    boards(ids: $boardId) {
      columns {
        id
        title
        type
      }
    }
  }
`;

export const getAllBoardsQuery = gql`
  query GetAllBoards {
    boards(limit: 50, order_by: used_at) {
      id
      name
      columns {
        id
        title
        type
      }
    }
  }
`;

export const getItemByPhoneQuery = gql`
  query GetItemByPhone($boardId: [ID!], $columnId: String!, $phone: String!) {
    items_page_by_column_values(limit: 1, board_id: $boardId, columns: [{column_id: $columnId, column_values: [$phone]}]) {
      items {
        id
        name
      }
    }
  }
`;