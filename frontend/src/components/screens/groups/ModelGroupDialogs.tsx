import {
  type Dispatch,
  type FormEventHandler,
  type SetStateAction,
  useState,
} from "react";
import { HeaderRows } from "@/components/ruleEditors/HeaderRows";
import { ParamRuleRows } from "@/components/ruleEditors/ParamRuleRows";
import { Button } from "@/components/ui/Button";
import { AppDialogContent, Dialog } from "@/components/ui/Dialog";
import { Separator } from "@/components/ui/Separator";
import type { ModelGroup, ModelGroupCandidateItem } from "@/lib/api/groups";
import type {
  CandidateChannelGroup,
  CandidateSearchMode,
  ChannelMemberGroup,
  FoldedMember,
  FormState,
  MemberStatusFilter,
} from "./groupTypes";
import { ModelGroupCandidateList } from "./ModelGroupCandidateList";
import { ModelGroupCandidateToolbar } from "./ModelGroupCandidateToolbar";
import { ModelGroupSelectedMembers } from "./ModelGroupSelectedMembers";
import { ModelGroupSettings } from "./ModelGroupSettings";
import { MultimodalFallbackGroups } from "./MultimodalFallbackGroups";
import { modelGroupItemKey } from "./modelGroupFormatting";

interface GroupEditorDialogProps {
  dialogOpen: boolean;
  setDialogOpen: Dispatch<SetStateAction<boolean>>;
  editingId: string | null;
  locale: "zh-CN" | "en-US";
  submit: FormEventHandler<HTMLFormElement>;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  routeTargetOptions: ModelGroup[];
  changeRouteTarget: (routeGroupId: string) => void;
  candidateSearchMode: CandidateSearchMode;
  changeCandidateSearchMode: (mode: CandidateSearchMode) => void;
  candidateSearch: string;
  changeCandidateSearch: (value: string) => void;
  addMatchedItems: () => void;
  candidateRegexInvalid: boolean;
  filteredCandidates: ModelGroupCandidateItem[];
  refetchCandidates: () => unknown;
  isFetchingCandidates: boolean;
  applySavedFilter: () => void;
  clearSavedFilter: () => void;
  groupedCandidates: CandidateChannelGroup[];
  expandedChannels: string[];
  toggleChannel: (channelId: string) => void;
  foldedMembers: FoldedMember[];
  addCandidate: (candidate: ModelGroupCandidateItem) => void;
  candidateIsError: boolean;
  candidateListError: unknown;
  disabledItemCount: number;
  invalidItemCount: number;
  removeInvalidItems: () => void;
  removeDisabledMembers: () => void;
  clearMembers: () => void;
  setAllMembersEnabled: (enabled: boolean) => void;
  memberStatusFilter: MemberStatusFilter;
  setMemberStatusFilter: Dispatch<SetStateAction<MemberStatusFilter>>;
  visibleFoldedMembers: Array<{ member: FoldedMember; index: number }>;
  visibleChannelGroups: ChannelMemberGroup[];
  toggleChannelMembers: (channelKey: string, enabled: boolean) => void;
  toggleFoldedMember: (foldKey: string, enabled: boolean) => void;
  removeFoldedMember: (foldKey: string) => void;
  moveChannelGroup: (fromIndex: number, toIndex: number) => void;
  moveFoldedMember: (fromIndex: number, toIndex: number) => void;
  moveFoldedMemberWithinChannel: (
    channelKey: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
}

interface DeleteGroupDialogProps {
  deleteTarget: ModelGroup | null;
  locale: "zh-CN" | "en-US";
  busyId: string | null;
  setDeleteTarget: Dispatch<SetStateAction<ModelGroup | null>>;
  remove: (item: ModelGroup) => void;
}

/** Render the create or edit dialog for a model group. */
export function GroupEditorDialog(props: GroupEditorDialogProps) {
  const {
    dialogOpen,
    setDialogOpen,
    editingId,
    locale,
    submit,
    form,
    setForm,
  } = props;
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const existingItemKeys = new Set(
    form.items.map((item) => modelGroupItemKey(item)),
  );

  return (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setAdvancedSettingsOpen(false);
          setDialogOpen(open);
        }}
      >
        <AppDialogContent
          className="h-[92dvh] max-w-5xl sm:h-[88vh]"
          title={
            editingId
              ? locale === "zh-CN"
                ? "编辑模型组"
                : "Edit group"
              : locale === "zh-CN"
                ? "新建模型组"
                : "Create group"
          }
          footer={
            <>
              <Button
                variant="outline"
                type="button"
                onClick={() => setDialogOpen(false)}
              >
                {locale === "zh-CN" ? "取消" : "Cancel"}
              </Button>
              <Button type="submit" form="model-group-form">
                {editingId
                  ? locale === "zh-CN"
                    ? "保存模型组"
                    : "Save group"
                  : locale === "zh-CN"
                    ? "创建模型组"
                    : "Create group"}
              </Button>
            </>
          }
        >
          <form
            id="model-group-form"
            className="flex flex-col gap-4 pr-1"
            onSubmit={submit}
          >
            <div className="flex flex-col gap-4">
              <ModelGroupSettings
                locale={locale}
                form={form}
                setForm={setForm}
                routeTargetOptions={props.routeTargetOptions}
                changeRouteTarget={props.changeRouteTarget}
                onOpenAdvanced={() => setAdvancedSettingsOpen(true)}
              />

              {!form.route_group_id ? (
                <>
                  <Separator />
                  <div className="grid gap-3 xl:grid-cols-2">
                    <section className="flex flex-col rounded-lg bg-muted/10">
                      <ModelGroupCandidateToolbar
                        locale={locale}
                        form={form}
                        candidateSearchMode={props.candidateSearchMode}
                        changeCandidateSearchMode={
                          props.changeCandidateSearchMode
                        }
                        candidateSearch={props.candidateSearch}
                        changeCandidateSearch={props.changeCandidateSearch}
                        addMatchedItems={props.addMatchedItems}
                        candidateRegexInvalid={props.candidateRegexInvalid}
                        filteredCandidateCount={props.filteredCandidates.length}
                        refetchCandidates={props.refetchCandidates}
                        isFetchingCandidates={props.isFetchingCandidates}
                        applySavedFilter={props.applySavedFilter}
                        clearSavedFilter={props.clearSavedFilter}
                      />
                      <ModelGroupCandidateList
                        locale={locale}
                        groupedCandidates={props.groupedCandidates}
                        expandedChannels={props.expandedChannels}
                        existingItemKeys={existingItemKeys}
                        toggleChannel={props.toggleChannel}
                        addCandidate={props.addCandidate}
                        candidateIsError={props.candidateIsError}
                        candidateListError={props.candidateListError}
                      />
                    </section>
                    <ModelGroupSelectedMembers
                      locale={locale}
                      strategy={form.strategy}
                      foldedMembers={props.foldedMembers}
                      disabledItemCount={props.disabledItemCount}
                      invalidItemCount={props.invalidItemCount}
                      removeInvalidItems={props.removeInvalidItems}
                      removeDisabledMembers={props.removeDisabledMembers}
                      clearMembers={props.clearMembers}
                      setAllMembersEnabled={props.setAllMembersEnabled}
                      memberStatusFilter={props.memberStatusFilter}
                      setMemberStatusFilter={props.setMemberStatusFilter}
                      visibleFoldedMembers={props.visibleFoldedMembers}
                      visibleChannelGroups={props.visibleChannelGroups}
                      toggleChannelMembers={props.toggleChannelMembers}
                      toggleFoldedMember={props.toggleFoldedMember}
                      removeFoldedMember={props.removeFoldedMember}
                      moveChannelGroup={props.moveChannelGroup}
                      moveFoldedMember={props.moveFoldedMember}
                      moveFoldedMemberWithinChannel={
                        props.moveFoldedMemberWithinChannel
                      }
                    />
                  </div>
                </>
              ) : null}
            </div>

          </form>
        </AppDialogContent>
      </Dialog>

      <Dialog
        open={advancedSettingsOpen}
        onOpenChange={setAdvancedSettingsOpen}
      >
        <AppDialogContent
          className="max-w-2xl"
          title={locale === "zh-CN" ? "更多设置" : "More settings"}
          footer={
            <Button
              type="button"
              onClick={() => setAdvancedSettingsOpen(false)}
            >
              {locale === "zh-CN" ? "完成" : "Done"}
            </Button>
          }
        >
          <div className="grid gap-5 pr-1">
            <HeaderRows
              title={locale === "zh-CN" ? "请求头" : "Request headers"}
              headers={form.headers}
              locale={locale}
              onAdd={() =>
                setForm((current) => ({
                  ...current,
                  headers: [
                    ...current.headers,
                    { key: "", value: "", action: "override" },
                  ],
                }))
              }
              onUpdate={(index, patch) =>
                setForm((current) => ({
                  ...current,
                  headers: current.headers.map((header, currentIndex) =>
                    currentIndex === index ? { ...header, ...patch } : header,
                  ),
                }))
              }
              onRemove={(index) =>
                setForm((current) => ({
                  ...current,
                  headers:
                    current.headers.length > 1
                      ? current.headers.filter(
                          (_, currentIndex) => currentIndex !== index,
                        )
                      : current.headers,
                }))
              }
            />
            <ParamRuleRows
              title={locale === "zh-CN" ? "参数规则" : "Parameter rules"}
              locale={locale}
              rules={form.param_override}
              onChange={(rules) =>
                setForm((current) => ({
                  ...current,
                  param_override: rules,
                }))
              }
            />
            {!form.route_group_id ? (
              <MultimodalFallbackGroups
                locale={locale}
                options={props.routeTargetOptions}
                selectedIds={form.fallback_group_ids}
                onChange={(ids) =>
                  setForm((current) => ({
                    ...current,
                    fallback_group_ids: ids,
                  }))
                }
              />
            ) : null}
          </div>
        </AppDialogContent>
      </Dialog>
    </>
  );
}

/** Render the confirmation dialog for deleting a model group. */
export function DeleteGroupDialog({
  deleteTarget,
  locale,
  busyId,
  setDeleteTarget,
  remove,
}: DeleteGroupDialogProps) {
  return (
    <Dialog
      open={Boolean(deleteTarget)}
      onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
      }}
    >
      <AppDialogContent
        className="max-w-lg"
        title={locale === "zh-CN" ? "确认删除模型组" : "Delete group"}
        description={
          locale === "zh-CN"
            ? "删除后，该模型组名称将不再参与路由匹配。"
            : "This group will no longer participate in routing."
        }
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => setDeleteTarget(null)}
            >
              {locale === "zh-CN" ? "取消" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={() => deleteTarget && void remove(deleteTarget)}
              disabled={busyId === deleteTarget?.id}
            >
              {busyId === deleteTarget?.id
                ? locale === "zh-CN"
                  ? "删除中..."
                  : "Deleting..."
                : locale === "zh-CN"
                  ? "确认删除"
                  : "Delete"}
            </Button>
          </>
        }
      >
        <div className="grid gap-5 pr-1">
          <div className="rounded-md border bg-muted/30 p-4">
            <strong>{deleteTarget?.name}</strong>
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
