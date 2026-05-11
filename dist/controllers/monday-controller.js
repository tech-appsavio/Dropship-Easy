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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reverseString = exports.executeAction = void 0;
const monday_service_1 = __importDefault(require("../services/monday-service"));
// use this as an action to monday.com trigger
function executeAction(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { shortLivedToken } = req.session;
        const { payload } = req.body;
        try {
            // TODO: Implement this function
            return res.status(200).send({});
        }
        catch (err) {
            console.error(err);
            return res.status(500).send({ message: 'internal server error' });
        }
    });
}
exports.executeAction = executeAction;
// use this as an action to monday.com trigger
function reverseString(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { shortLivedToken } = req.session;
        const { payload } = req.body;
        try {
            const { inputFields } = payload;
            const { boardId, itemId, sourceColumnId, targetColumnId } = inputFields;
            const sourceWord = yield monday_service_1.default.getColumnValue(shortLivedToken, itemId, sourceColumnId);
            if (!sourceWord) {
                yield monday_service_1.default.changeColumnValue(shortLivedToken, boardId, itemId, targetColumnId, 'No word found');
                return res.status(200).send({});
            }
            const reversedWord = sourceWord.split('').reverse().join('');
            yield monday_service_1.default.changeColumnValue(shortLivedToken, boardId, itemId, targetColumnId, reversedWord);
        }
        catch (e) {
            console.log(e.toString());
            return res.status(500).send({ message: 'internal server error' });
        }
        return res.status(200).send({});
    });
}
exports.reverseString = reverseString;
