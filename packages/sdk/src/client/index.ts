/** biome-ignore-all lint/complexity/noUselessConstructor: subclasses wire action modules */

import { UserRoleLevel } from "@repo/auth/types";
import AccountActions from "../actions/account/action";
import ApplicationActions from "../actions/application/application";
import AuthActions from "../actions/auth/action";
import BoardActions from "../actions/board/action";
import BoardCardActions from "../actions/boardCard/action";
import BoardDraftActions from "../actions/boardDraft/action";
import BoardMemberActions from "../actions/boardMember/action";
import EntityActions from "../actions/entity/action";
import FileActions from "../actions/file/action";
import NotificationActions from "../actions/notification/action";
import RunnerActions from "../actions/runner/action";
import UserActions from "../actions/user/user/action";
import BaseClient, { type Config } from "./base";

export class Client extends BaseClient {
    application!: ApplicationActions;
    authApi!: AuthActions;
    user!: UserActions;
    entity!: EntityActions;
    board!: BoardActions;
    boardCard!: BoardCardActions;
    boardDraft!: BoardDraftActions;
    boardMember!: BoardMemberActions;
    file!: FileActions;
    account!: AccountActions;
    notification!: NotificationActions;
    runner!: RunnerActions;

    constructor(config: Config) {
        super(config);
        this.account = new AccountActions(this);
        this.application = new ApplicationActions(this);
        this.authApi = new AuthActions(this);
        this.user = new UserActions(this);
        this.entity = new EntityActions(this);
        this.board = new BoardActions(this);
        this.boardCard = new BoardCardActions(this);
        this.boardDraft = new BoardDraftActions(this);
        this.boardMember = new BoardMemberActions(this);
        this.file = new FileActions(this);
        this.notification = new NotificationActions(this);
        this.runner = new RunnerActions(this);
    }

    get isAdminContext(): boolean {
        return this.config.context === "admin";
    }

    get isCommonContext(): boolean {
        return this.config.context === "common";
    }

    changeToAdminContext(): void {
        this.config.context = "admin";
        this.setHeader("x-role", UserRoleLevel.ADMIN);
    }

    changeToCommonContext(): void {
        this.config.context = "common";
        this.setHeader("x-role", UserRoleLevel.COMMON);
    }

    ensureIsAdminContext(): void {
        if (this.config.context !== "admin") {
            throw new Error(
                "Change SDK context to ADMIN to access this action"
            );
        }
    }

    ensureIsCommonContext(): void {
        if (this.config.context !== "common") {
            throw new Error(
                "Change SDK context to COMMON to access this action"
            );
        }
    }
}
