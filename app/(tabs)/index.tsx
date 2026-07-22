import { Feather, Octicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PickerModal } from "@/components/PickerModal";
import { useGitHub } from "@/context/GitHubContext";
import { useI18n } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { showAlert } from "@/utils/dialogs";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}j`;
}

function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {/**/});
}

function Collapsible({ title, children }: { title: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  return (
    <View style={{ borderTopWidth: 1, borderColor: colors.border }}>
      <Pressable
        style={({ pressed }) => [
          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16, paddingHorizontal: 16 },
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => { setOpen((v) => !v); hapticLight(); }}
      >
        <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>{title}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </Pressable>
      {open && children}
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const {
    user, repos, selectedRepo, branches, currentBranch, commits,
    loading, reposLoading, refreshCommits, selectRepo, selectBranch,
  } = useGitHub();
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [notifsOn, setNotifsOn] = useState(false);

  React.useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#00ff41" size="large" />
      </View>
    );
  }

  if (!user) return null;

  const filteredRepos = repos.filter((r) =>
    r.name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  async function onRefresh() {
    setRefreshing(true);
    hapticLight();
    await refreshCommits();
    setRefreshing(false);
  }

  // SYNC : actualise réellement les commits
  async function onSyncPress() {
    if (!selectedRepo) {
      showAlert(t("msg.error"), t("home.selectRepoFirst"));
      return;
    }
    setSyncing(true);
    hapticLight();
    await refreshCommits();
    setSyncing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {/**/});
  }

  // CLONER : ouvre le dépôt sur GitHub (page où l'URL de clone est copiable)
  function onClonePress() {
    if (!selectedRepo) {
      setShowRepoModal(true);
      return;
    }
    hapticLight();
    WebBrowser.openBrowserAsync(selectedRepo.html_url).catch(() => {/**/});
  }

  function goFiles() {
    hapticLight();
    router.push("/(tabs)/files");
  }

  function goSettings() {
    hapticLight();
    router.push("/(tabs)/settings");
  }

  const s = makeStyles(colors);
  const webTop = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + webTop }]}>
        <Text style={s.headerTitle}>GitCrush</Text>
        <View style={s.headerRight}>
          <Pressable
            style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.8 }]}
            onPress={goFiles}
            hitSlop={6}
          >
            <Octicons name="diff-added" size={14} color="#fff" />
            <Text style={s.addBtnText}>{t("home.add")}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Commits card */}
        <View style={s.commitsCard}>
          {commits.length === 0 ? (
            <View style={s.emptyBox}>
              <Octicons name="git-commit" size={24} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
              <Text style={s.emptyText}>{t("home.noCommits")}</Text>
              {!selectedRepo && (
                <Text style={s.emptyHint}>{t("home.selectRepoHint")}</Text>
              )}
            </View>
          ) : (
            <FlatList
              data={commits}
              scrollEnabled={false}
              keyExtractor={(c) => c.sha}
              renderItem={({ item }) => (
                <View style={s.commitRow}>
                  <View style={s.commitDot} />
                  <View style={s.commitInfo}>
                    <Text style={s.commitMsg} numberOfLines={1}>
                      {item.commit.message.split("\n")[0]}
                    </Text>
                    <Text style={s.commitMeta}>
                      {item.commit.author.name} · {timeAgo(item.commit.author.date)}
                    </Text>
                  </View>
                  <Text style={s.commitSha}>{item.sha.slice(0, 7)}</Text>
                </View>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
            />
          )}
        </View>

        {/* Current branch — appuyer sur la ligne ou le + ouvre le sélecteur de branche */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>{t("home.currentBranch")}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [s.branchRow, pressed && { opacity: 0.8 }]}
            onPress={() => {
              if (!selectedRepo) { setShowRepoModal(true); return; }
              hapticLight();
              setShowBranchModal(true);
            }}
          >
            <Octicons name="git-branch" size={16} color={colors.accent} style={{ marginRight: 8 }} />
            <Text style={s.branchName}>{selectedRepo ? currentBranch : t("home.unborn")}</Text>
            <View style={s.plusBtn}>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </View>
          </Pressable>
        </View>

        {/* Sync row — la ligne entière synchronise les commits */}
        <Pressable
          style={({ pressed }) => [s.syncRow, pressed && { opacity: 0.8 }]}
          onPress={onSyncPress}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Feather name="download-cloud" size={18} color={colors.mutedForeground} />
          )}
          <Text style={s.syncText}>{t("home.syncChanges")}</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
            onPress={goFiles}
            hitSlop={4}
          >
            <Feather name="more-horizontal" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
            onPress={goSettings}
            hitSlop={4}
          >
            <Feather name="settings" size={15} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
            onPress={() => {
              const next = !notifsOn;
              setNotifsOn(next);
              hapticLight();
              showAlert(next ? t("home.notifsOn") : t("home.notifsOff"));
            }}
            hitSlop={4}
          >
            <Feather name={notifsOn ? "bell" : "bell-off"} size={15} color={notifsOn ? colors.accent : colors.mutedForeground} />
          </Pressable>
        </Pressable>

        {/* Remote / Origin */}
        <View style={s.remoteSection}>
          <Text style={s.sectionLabel}>{t("home.remoteOrigin")}</Text>
          <View style={s.remoteRow}>
            {/* Le dropdown ouvre le sélecteur de dépôt */}
            <Pressable
              style={({ pressed }) => [s.remoteDropdown, pressed && { opacity: 0.8 }]}
              onPress={() => { hapticLight(); setShowRepoModal(true); }}
            >
              <Text style={s.remoteDropdownText} numberOfLines={1}>
                {selectedRepo ? selectedRepo.name : t("home.none")}
              </Text>
              {selectedRepo ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    hapticLight();
                    selectRepo(null);
                  }}
                >
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </Pressable>
              ) : (
                <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.cloneBtn, pressed && { opacity: 0.7 }]}
              onPress={onClonePress}
            >
              <Feather name="download-cloud" size={14} color={colors.foreground} />
              <Text style={s.cloneBtnText}>{t("home.clone")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                s.authBtn,
                { backgroundColor: selectedRepo ? colors.primary : colors.card },
                pressed && { opacity: 0.7 },
              ]}
              onPress={goSettings}
            >
              <Feather name="check-circle" size={14} color={selectedRepo ? "#fff" : colors.mutedForeground} />
              <Text style={[s.authBtnText, { color: selectedRepo ? "#fff" : colors.mutedForeground }]}>{t("home.auth")}</Text>
            </Pressable>
          </View>
        </View>

        {/* Directory */}
        <View style={s.dirSection}>
          <Text style={s.sectionLabel}>{t("home.directory")}</Text>
          <Pressable
            style={({ pressed }) => [s.dirRow, pressed && { opacity: 0.8 }]}
            onPress={goFiles}
          >
            <Text style={s.dirText} numberOfLines={1}>
              {selectedRepo ? `/${selectedRepo.full_name}` : t("home.noRepoSelected")}
            </Text>
            <View style={s.iconBtn}>
              <Feather name="folder" size={18} color={colors.mutedForeground} />
            </View>
          </Pressable>
        </View>

        {/* Collapsibles */}
        <View style={s.collapsibles}>
          <Collapsible title={t("home.gitFilters")}>
            <View style={{ padding: 16, paddingTop: 0 }}>
              <Text style={s.collapsibleText}>{t("home.gitFiltersHint")}</Text>
            </View>
          </Collapsible>
          <Collapsible title={t("home.appSync")}>
            <View style={{ padding: 16, paddingTop: 0 }}>
              <Text style={s.collapsibleText}>{t("home.appSyncHint")}</Text>
            </View>
          </Collapsible>
          <Collapsible title={t("home.scheduledSync")}>
            <View style={{ padding: 16, paddingTop: 0 }}>
              <Text style={s.collapsibleText}>{t("home.scheduledSyncHint")}</Text>
            </View>
          </Collapsible>
        </View>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 90) }} />
      </ScrollView>

      {/* Sélecteur de dépôt */}
      <PickerModal
        visible={showRepoModal}
        title={t("home.chooseRepo")}
        loading={reposLoading}
        searchable
        searchValue={repoSearch}
        onSearchChange={setRepoSearch}
        searchPlaceholder={t("files.search")}
        emptyLabel={t("files.noRepoFound")}
        items={filteredRepos.map((r) => ({
          key: String(r.id),
          label: r.full_name,
          icon: r.private ? ("lock" as const) : ("repo" as const),
          selected: selectedRepo?.id === r.id,
        }))}
        onSelect={(key) => {
          const repo = repos.find((r) => String(r.id) === key);
          if (repo) {
            selectRepo(repo);
            hapticLight();
          }
          setShowRepoModal(false);
          setRepoSearch("");
        }}
        onClose={() => { setShowRepoModal(false); setRepoSearch(""); }}
      />

      {/* Sélecteur de branche */}
      <PickerModal
        visible={showBranchModal}
        title={t("home.chooseBranch")}
        emptyLabel={t("home.unborn")}
        items={branches.map((b) => ({
          key: b.name,
          label: b.name,
          icon: "git-branch" as const,
          selected: currentBranch === b.name,
        }))}
        onSelect={(key) => {
          selectBranch(key);
          hapticLight();
          setShowBranchModal(false);
        }}
        onClose={() => setShowBranchModal(false)}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      flex: 1,
    },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
    iconBtn: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 17,
    },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      marginLeft: 4,
    },
    addBtnText: { fontSize: 11, fontWeight: "700" as const, color: "#fff", fontFamily: "Inter_700Bold" },
    scroll: { flex: 1 },
    commitsCard: {
      margin: 12,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 120,
      overflow: "hidden",
    },
    emptyBox: { alignItems: "center", justifyContent: "center", padding: 40 },
    emptyText: {
      color: colors.mutedForeground,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.5,
    },
    emptyHint: {
      color: colors.mutedForeground,
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      marginTop: 6,
      textAlign: "center",
    },
    commitRow: { flexDirection: "row", alignItems: "center", padding: 12 },
    commitDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.green,
      marginRight: 10,
    },
    commitInfo: { flex: 1 },
    commitMsg: { fontSize: 13, color: colors.foreground, fontFamily: "Inter_500Medium" },
    commitMeta: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    commitSha: {
      fontSize: 11,
      color: colors.accent,
      fontFamily: "Inter_400Regular",
      backgroundColor: colors.greenBg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    section: { paddingHorizontal: 16, paddingVertical: 12 },
    sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    sectionLabel: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
    },
    branchRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    branchName: {
      flex: 1,
      fontSize: 15,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    plusBtn: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 6,
      backgroundColor: colors.secondary,
    },
    syncRow: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 12,
      marginBottom: 8,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
    },
    syncText: {
      fontSize: 13,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    remoteSection: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    remoteRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    remoteDropdown: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    remoteDropdownText: {
      flex: 1,
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    cloneBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    cloneBtnText: { fontSize: 12, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold" },
    authBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    authBtnText: { fontSize: 12, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
    dirSection: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    dirRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    dirText: { flex: 1, fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    collapsibles: {
      marginHorizontal: 12,
      marginTop: 8,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    collapsibleText: {
      color: colors.mutedForeground,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      lineHeight: 18,
    },
  });
}
