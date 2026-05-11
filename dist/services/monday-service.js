"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@mondaydotcomorg/api");
const queries_graphql_1 = require("../queries.graphql");
class MondayService {
    static getMe(shortLiveToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mondayClient = new api_1.ApiClient({ token: shortLiveToken });
                const me = yield mondayClient.operations.getMeOp();
                return me;
            }
            catch (err) {
                console.log(err);
            }
        });
    }
    static getColumnValue(token, itemId, columnId) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mondayClient = new api_1.ApiClient({ token: token });
                const params = { itemId: [itemId], columnId: [columnId] };
                const response = yield mondayClient.request(queries_graphql_1.getColumnValueQuery, params);
                return (_d = (_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.items) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.column_values) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.value;
            }
            catch (err) {
                console.log(err);
            }
        });
    }
    static changeColumnValue(token, boardId, itemId, columnId, value) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const mondayClient = new api_1.ApiClient({ token: token });
                const changeStatusColumn = yield mondayClient.operations.changeColumnValueOp({
                    boardId: boardId,
                    itemId: itemId,
                    columnId: columnId,
                    value: value,
                });
                return changeStatusColumn;
            }
            catch (err) {
                console.log(err);
            }
        });
    }
}
exports.default = MondayService;
