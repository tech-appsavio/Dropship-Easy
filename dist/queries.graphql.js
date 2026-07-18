"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getItemByPhoneQuery = exports.getAllBoardsQuery = exports.getBoardColumnsQuery = exports.getColumnValueQuery = exports.exampleMutation = exports.exampleQuery = void 0;
const graphql_request_1 = require("graphql-request");
exports.exampleQuery = (0, graphql_request_1.gql) `
  query GetBoards($ids: [ID!]) {
    boards(ids: $ids) {
      id
      name
    }
  }
`;
exports.exampleMutation = (0, graphql_request_1.gql) `
  mutation CreateItem($boardId: ID!, $groupId: String!, $itemName: String!) {
    create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName) {
      id
      name
    }
  }
`;
exports.getColumnValueQuery = (0, graphql_request_1.gql) `query GetColumnValue($itemId: [ID!], $columnId: [String!]) {
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
exports.getBoardColumnsQuery = (0, graphql_request_1.gql) `
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
exports.getAllBoardsQuery = (0, graphql_request_1.gql) `
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
exports.getItemByPhoneQuery = (0, graphql_request_1.gql) `
  query GetItemByPhone($boardId: [ID!], $columnId: String!, $phone: String!) {
    items_page_by_column_values(limit: 1, board_id: $boardId, columns: [{column_id: $columnId, column_values: [$phone]}]) {
      items {
        id
        name
      }
    }
  }
`;
