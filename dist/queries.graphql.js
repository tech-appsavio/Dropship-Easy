"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getColumnValueQuery = exports.exampleMutation = exports.exampleQuery = void 0;
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
          }
        }
      }`;
