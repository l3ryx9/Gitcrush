import { Feather, Ionicons, Octicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
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

import { useGitHub } from "@/context/GitHubContext";
import { useColors } from "@/hooks/useColors";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}j`;
}

function Collapsible({ title, children }: { title: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  return (
    <View style={{ borderTopWidth: 1, borderColor: colors.border }}>
      <Pressable
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16, paddingHorizontal: 16 }}
        onPress={() => setOpen((v) => !v)}
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
  const { user, selectedRepo, currentBranch, commits, loading, refreshCommits } = useGitHub();
  const [refreshing, setRefreshing] = useState(false);

  React.useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0d1117", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#3fb950" size="large" />
      </View>
    );
  }

  if (!user) return null;

  async function onRefresh() {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshCommits();
    setRefreshing(false);
  }

  const s = makeStyles(colors);

  const webTop = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + webTop }]}>
        <Text style={s.headerTitle}>GitSync</Text>
        <View style={s.headerRight}>
          <Pressable style={s.iconBtn}>
            <Feather name="settings" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={s.iconBtn}>
            <Feather name="circle" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={s.addBtn} onPress={() => router.push("/(tabs)/files")}>
            <Octicons name="diff-added" size={14} color="#fff" />
            <Text style={s.addBtnText}>AJOUTER</Text>
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
          {loading ? (
            <View style={s.emptyBox}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : commits.length === 0 ? (
            <View style={s.emptyBox}>
              <Octicons name="git-commit" size={24} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
              <Text style={s.emptyText}>AUCUN COMMIT TROUVÉ...</Text>
              {!selectedRepo && (
                <Text style={s.emptyHint}>Sélectionnez un dépôt pour voir les commits</Text>
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

        {/* Current branch */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>CURRENT BRANCH</Text>
          </View>
          <View style={s.branchRow}>
            <Octicons name="git-branch" size={16} color={colors.accent} style={{ marginRight: 8 }} />
            <Text style={s.branchName}>{selectedRepo ? currentBranch : "UNBORN BRANCH"}</Text>
            <Pressable style={s.plusBtn}>
              <Feather name="plus" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {/* Sync row */}
        <View style={s.syncRow}>
          <Feather name="download-cloud" size={18} color={colors.mutedForeground} />
          <Text style={s.syncText}>SYNC LES MODIFICATIONS</Text>
          <View style={{ flex: 1 }} />
          <Pressable style={s.iconBtn}>
            <Feather name="more-horizontal" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={s.iconBtn}>
            <Feather name="settings" size={15} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={s.iconBtn}>
            <Feather name="bell-off" size={15} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Remote / Origin */}
        <View style={s.remoteSection}>
          <Text style={s.sectionLabel}>DISTANT · ORIGIN</Text>
          <View style={s.remoteRow}>
            <View style={s.remoteDropdown}>
              <Text style={s.remoteDropdownText} numberOfLines={1}>
                {selectedRepo ? selectedRepo.name : "Aucun..."}
              </Text>
              {selectedRepo && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
            <Pressable style={s.cloneBtn} onPress={() => router.push("/(tabs)/files")}>
              <Feather name="download-cloud" size={14} color={colors.foreground} />
              <Text style={s.cloneBtnText}>CLONER</Text>
            </Pressable>
            <Pressable
              style={[s.authBtn, { backgroundColor: selectedRepo ? colors.primary : colors.card }]}
              onPress={() => router.push("/(tabs)/files")}
            >
              <Feather name="check-circle" size={14} color={selectedRepo ? "#fff" : colors.mutedForeground} />
              <Text style={[s.authBtnText, { color: selectedRepo ? "#fff" : colors.mutedForeground }]}>AUTH</Text>
            </Pressable>
          </View>
        </View>

        {/* Directory */}
        <View style={s.dirSection}>
          <Text style={s.sectionLabel}>RÉPERTOIRE</Text>
          <View style={s.dirRow}>
            <Text style={s.dirText} numberOfLines={1}>
              {selectedRepo ? `/${selectedRepo.full_name}` : "Aucun dépôt sélectionné..."}
            </Text>
            <Pressable style={s.iconBtn} onPress={() => router.push("/(tabs)/files")}>
              <Feather name="folder" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {/* Collapsibles */}
        <View style={s.collapsibles}>
          <Collapsible title="GIT FILTERS" />
          <Collapsible title="App Sync Settings">
            <View style={{ padding: 16, paddingTop: 0 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                Configurez vos préférences de synchronisation dans l'onglet Fichiers.
              </Text>
            </View>
          </Collapsible>
          <Collapsible title="PARAMÈTRES DE SYNC PLANIFIÉE" />
        </View>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 90) }} />
      </ScrollView>
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
    remoteSection: { paddingHorizontal: 12, paddingVertical: 8 },
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
    dirSection: { paddingHorizontal: 12, paddingVertical: 8 },
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
  });
}
