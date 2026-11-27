/** biome-ignore-all lint/complexity/noUselessConstructor: subclasses wire action modules */

import AccountActions from "../actions/account/action";
import ApplicationActions from "../actions/application/application";
import AuthActions from "../actions/auth/action";
import BoardActions from "../actions/board/action";
import BoardCardActions from "../actions/boardCard/action";
import BoardDraftActions from "../actions/boardDraft/action";
import BoardMemberActions from "../actions/boardMember/action";
import FileActions from "../actions/file/action";
import RunnerActions from "../actions/runner/action";
import BaseClient, { type Config } from "./base";

export class Client extends BaseClient {
    application!: ApplicationActions;
    authApi!: AuthActions;
    board!: BoardActions;
    boardCard!: BoardCardActions;
    boardDraft!: BoardDraftActions;
    boardMember!: BoardMemberActions;
    file!: FileActions;
    account!: AccountActions;
    runner!: RunnerActions;

    constructor(config: Config) {
        super(config);
        this.account = new AccountActions(this);
        this.application = new ApplicationActions(this);
        this.authApi = new AuthActions(this);
        this.board = new BoardActions(this);
        this.boardCard = new BoardCardActions(this);
        this.boardDraft = new BoardDraftActions(this);
        this.boardMember = new BoardMemberActions(this);
        this.file = new FileActions(this);
        this.runner = new RunnerActions(this);
    }
}
