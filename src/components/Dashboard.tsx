import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, ComposedChart
} from 'recharts';
import { 
  TrendingUp, Users, Target, AlertCircle, Calendar, 
  ArrowUpRight, ArrowDownRight, ChevronRight, LayoutDashboard,
  PieChart, Edit3, RefreshCw, AlertTriangle,
  Share2, LogIn, LogOut, Copy, Eye, ArrowLeft, Loader2, Sparkles, Check, Info, ShieldAlert,
  Trophy, Award, FileText
} from 'lucide-react';
import { INITIAL_DATA } from '../constants';
import { BusinessTarget } from '../types';
import { formatCurrency, formatPercent, cn, formatFY, formatNumber } from '../lib/utils';
import DataEntryForm from './DataEntryForm';

// Firebase integrations
import { 
  collection, doc, setDoc, updateDoc, getDoc, getDocs, onSnapshot, 
  query, where, serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, loginWithGoogle, logoutUser, handleFirestoreError, OperationType } from '../lib/firebase';

export default function Dashboard() {
  const STORAGE_KEY_DATA = 'takaful_tracker_data_store';
  const STORAGE_KEY_YEAR = 'takaful_tracker_selected_year';

  const [allData, setAllData] = useState<Record<number, BusinessTarget>>(() => {
    const defaultData = { [INITIAL_DATA.year]: INITIAL_DATA };
    if (typeof window === 'undefined') return defaultData;

    const savedData = localStorage.getItem(STORAGE_KEY_DATA) || localStorage.getItem('takaful_tracker_all_data_v2') || localStorage.getItem('takaful_tracker_all_data');
    if (!savedData) return defaultData;

    try {
      const parsed = JSON.parse(savedData);
      const migrated: Record<number, BusinessTarget> = {};

      Object.keys(parsed).forEach(yearStr => {
        const y = Number(yearStr);
        const yearData = parsed[y];

        // Deep merge monthly breakdown to ensure new fields (like targetCases) exist
        const mergedMonthly = INITIAL_DATA.monthlyBreakdown.map((defaultMonth, idx) => {
          const savedMonth = yearData.monthlyBreakdown?.[idx];
          if (!savedMonth) return defaultMonth;
          return { ...defaultMonth, ...savedMonth };
        });

        migrated[y] = {
          ...INITIAL_DATA,
          ...yearData,
          year: y,
          monthlyBreakdown: mergedMonthly
        };
      });

      return Object.keys(migrated).length > 0 ? migrated : defaultData;
    } catch (e) {
      console.error("Gagal migrasi data:", e);
      return defaultData;
    }
  });

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const savedYear = localStorage.getItem(STORAGE_KEY_YEAR);
      if (savedYear) return Number(savedYear);
    }
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  // Firebase auth & multi-user states
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLead, setIsLead] = useState(false);
  const [simulatedLead, setSimulatedLead] = useState(false);
  const [allAgentsTargets, setAllAgentsTargets] = useState<any[]>([]);
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const [activeAgentView, setActiveAgentView] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'personal' | 'team'>('personal');
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [customAgentName, setCustomAgentName] = useState('');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingAgentEmail, setEditingAgentEmail] = useState<string | null>(null);

  // Agent private notes states
  const [agentNotes, setAgentNotes] = useState<Record<string, string>>({});
  const [simulatedNotes, setSimulatedNotes] = useState<Record<string, string>>({
    'mock_ejen_1': "Prestasi konsisten, prospek perlu ditingkatkan.",
    'mock_ejen_2': "Ejen terbaik bulan ini! Fokus pada closing kes besar.",
  });
  const [selectedAgentForNote, setSelectedAgentForNote] = useState<any | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [tempNoteText, setTempNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Fetch the agent's real-time custom name from firestore profile doc
  useEffect(() => {
    if (!user) {
      setCustomAgentName('');
      return;
    }
    const agentRef = doc(db, 'agents', user.uid);
    const unsubscribe = onSnapshot(agentRef, (docSnap) => {
      if (docSnap.exists()) {
        const agentData = docSnap.data();
        if (agentData.name) {
          setCustomAgentName(agentData.name);
          setEditedName(agentData.name);
        }
      } else {
        const fallback = user.displayName || user.email?.split('@')[0] || "Ejen";
        setCustomAgentName(fallback);
        setEditedName(fallback);
      }
    }, (error) => {
      console.warn("Ralat memuat nama ejen:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Scoreboard filter states
  const [scoreboardType, setScoreboardType] = useState<'annual' | 'monthly'>('annual');
  const [selectedScoreboardMonthIdx, setSelectedScoreboardMonthIdx] = useState<number>(() => {
    const d = new Date();
    return (d.getMonth() - 3 + 12) % 12;
  });

  const [personalProgressType, setPersonalProgressType] = useState<'annual' | 'monthly'>('annual');
  const [selectedPersonalMonthIdx, setSelectedPersonalMonthIdx] = useState<number>(() => {
    const d = new Date();
    return (d.getMonth() - 3 + 12) % 12;
  });

  const [localClosingRatio, setLocalClosingRatio] = useState<string>('');
  const [localClosingRatioPresentation, setLocalClosingRatioPresentation] = useState<string>('');

  const MONTH_FULL_NAMES = useMemo(() => [
    'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember', 'Januari', 'Februari', 'Mac'
  ], []);

  const MONTH_ABBRS = useMemo(() => [
    'Apr', 'Mei', 'Jun', 'Jul', 'Ogos', 'Sep', 'Okt', 'Nov', 'Dis', 'Jan', 'Feb', 'Mac'
  ], []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(allData));
  }, [allData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_YEAR, selectedYear.toString());
  }, [selectedYear]);

  // Auth & Cloud synchronization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthLoading(false);
      
      if (u) {
        // Automatically sync local to cloud upon first login
        const agentName = u.displayName || u.email?.split('@')[0] || "Ejen";
        const agentEmail = u.email || "";
        await syncLocalToCloud(u.uid, agentName, agentEmail);
      }
    });

    return () => unsubscribe();
  }, []);

  // Leader state determination
  useEffect(() => {
    if (user) {
      const isUserLead = user.email?.toLowerCase() === 'afyan.ikhlas@gmail.com';
      setIsLead(isUserLead);
      if (isUserLead) {
        setSimulatedLead(false);
      }
    } else {
      setIsLead(false);
    }
  }, [user]);

  // Real-time agent notes subscription (strictly for Leader)
  useEffect(() => {
    if (!user || !isLead) {
      setAgentNotes({});
      return;
    }

    const notesQ = query(collection(db, 'agent_notes'));
    const unsubscribeNotes = onSnapshot(notesQ, (snapshot) => {
      const notesMap: Record<string, string> = {};
      snapshot.forEach((doc) => {
        notesMap[doc.id] = doc.data().note || "";
      });
      setAgentNotes(notesMap);
    }, (error) => {
      console.error("Gagal melanggan nota ejen:", error);
      handleFirestoreError(error, OperationType.GET, 'agent_notes');
    });

    return () => {
      unsubscribeNotes();
    };
  }, [user, isLead]);

  // Handle saving the private note to firestore or simulation state
  const handleSaveNote = async () => {
    if (!selectedAgentForNote) return;
    setIsSavingNote(true);
    const agentId = selectedAgentForNote.agentId;
    
    if (simulatedLead) {
      setSimulatedNotes(prev => ({
        ...prev,
        [agentId]: tempNoteText
      }));
      setIsSavingNote(false);
      setIsEditingNote(false);
      setSelectedAgentForNote(null);
      return;
    }

    try {
      const noteRef = doc(db, 'agent_notes', agentId);
      await setDoc(noteRef, {
        agentId,
        note: tempNoteText,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setIsSavingNote(false);
      setIsEditingNote(false);
      setSelectedAgentForNote(null);
    } catch (e) {
      console.error("Gagal menyimpan nota ejen:", e);
      setIsSavingNote(false);
      handleFirestoreError(e, OperationType.WRITE, `agent_notes/${agentId}`);
    }
  };

  // Real-time team aggregate values logic
  useEffect(() => {
    if (!user && !simulatedLead) {
      setAllAgentsTargets([]);
      setAllAgents([]);
      return;
    }

    if (simulatedLead) {
      // Mock data is already handled in seedSimulationData
      return;
    }

    const q = (isLead || simulatedLead)
      ? query(collection(db, 'agent_targets'))
      : query(collection(db, 'agent_targets'), where('agentId', '==', user.uid));
    const agentsQ = (isLead || simulatedLead)
      ? query(collection(db, 'agents'))
      : query(collection(db, 'agents'), where('agentId', '==', user.uid));
    
    const unsubscribeTargets = onSnapshot(q, (snapshot) => {
      const targetsList: any[] = [];
      snapshot.forEach((doc) => {
        targetsList.push(doc.data());
      });
      setAllAgentsTargets(targetsList);
    }, (error) => {
      console.error("Gagal melanggan data kumpulan:", error);
    });

    const unsubscribeAgents = onSnapshot(agentsQ, (snapshot) => {
      const agentsList: any[] = [];
      snapshot.forEach((doc) => {
        agentsList.push(doc.data());
      });
      setAllAgents(agentsList);
    }, (error) => {
      console.error("Gagal melanggan data profil ejen:", error);
    });

    return () => {
      unsubscribeTargets();
      unsubscribeAgents();
    };
  }, [user, simulatedLead, isLead]);

  // Cloud listener for active self yearly target changes
  useEffect(() => {
    if (!user) return;

    const targetId = `${user.uid}_${selectedYear}`;
    const targetRef = doc(db, 'agent_targets', targetId);

    const unsubscribe = onSnapshot(targetRef, (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        setAllData(prev => {
          const prevStr = JSON.stringify(prev[selectedYear]);
          const nextData = {
            year: selectedYear,
            overallTargetAce: cloudData.overallTargetAce,
            overallTargetCases: cloudData.overallTargetCases,
            overallTargetAcs: cloudData.overallTargetAcs,
            monthlyBreakdown: cloudData.monthlyBreakdown,
            closingRatio: cloudData.closingRatio || 0,
            closingRatioPresentation: cloudData.closingRatioPresentation || 0
          };
          const nextStr = JSON.stringify(nextData);
          if (prevStr === nextStr) return prev;
          
          return {
            ...prev,
            [selectedYear]: nextData
          };
        });
      }
    }, (error) => {
      console.warn("Ralat muat turun dokumen peranti:", error);
    });

    return () => unsubscribe();
  }, [user, selectedYear]);

  // Syncing algorithm matching rules
  const syncLocalToCloud = async (uid: string, agentName: string, agentEmail: string) => {
    setIsSyncing(true);
    
    let dbAgentName = agentName;

    // 1. Create/Update core metadata register profiles (Isolated to prevent blocking target sync)
    try {
      const agentRef = doc(db, 'agents', uid);
      const agentSnap = await getDoc(agentRef);
      if (!agentSnap.exists()) {
        await setDoc(agentRef, {
          agentId: uid,
          name: agentName,
          email: agentEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        dbAgentName = agentName;
      } else {
        const agentData = agentSnap.data();
        dbAgentName = agentData?.name || agentName;
        await updateDoc(agentRef, {
          name: dbAgentName,
          email: agentEmail,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.warn("Ralat penyelarasan rekod profil pembekal/ejen:", error);
    }

    // 2. Scan annual targets matching rules
    try {
      const updatedAllData = { ...allData };
      let hasCloudUpdates = false;

      for (const yearStr of Object.keys(allData)) {
        const year = Number(yearStr);
        const yearData = allData[year];
        const targetId = `${uid}_${year}`;
        const targetRef = doc(db, 'agent_targets', targetId);
        const targetSnap = await getDoc(targetRef);

        if (!targetSnap.exists()) {
          // Sync local data into empty cloud document
          await setDoc(targetRef, {
            targetId,
            agentId: uid,
            agentName: dbAgentName,
            agentEmail,
            year,
            overallTargetAce: yearData.overallTargetAce,
            overallTargetCases: yearData.overallTargetCases,
            overallTargetAcs: yearData.overallTargetAcs,
            monthlyBreakdown: yearData.monthlyBreakdown,
            closingRatio: yearData.closingRatio || 0,
            closingRatioPresentation: yearData.closingRatioPresentation || 0,
            updatedAt: serverTimestamp()
          });
        } else {
          // Load updated cloud document content down into browser
          const cloudData = targetSnap.data();
          if (cloudData) {
            updatedAllData[year] = {
              year,
              overallTargetAce: cloudData.overallTargetAce ?? yearData.overallTargetAce,
              overallTargetCases: cloudData.overallTargetCases ?? yearData.overallTargetCases,
              overallTargetAcs: cloudData.overallTargetAcs ?? yearData.overallTargetAcs,
              monthlyBreakdown: cloudData.monthlyBreakdown ?? yearData.monthlyBreakdown,
              closingRatio: cloudData.closingRatio ?? yearData.closingRatio ?? 0,
              closingRatioPresentation: cloudData.closingRatioPresentation ?? yearData.closingRatioPresentation ?? 0
            };
            hasCloudUpdates = true;
          }
        }
      }

      if (hasCloudUpdates) {
        setAllData(updatedAllData);
      }
    } catch (error) {
      console.error("Gagal menyelaras rekod sasaran peranti:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const years = useMemo(() => {
    const yearsSet = new Set<number>();
    
    // Always include current, preceding, and next cycle years dynamically
    const now = new Date();
    const currentFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    yearsSet.add(currentFY);
    yearsSet.add(currentFY - 1);
    yearsSet.add(2024); // baseline fallback
    
    // Add years from local allData
    Object.keys(allData).forEach(y => yearsSet.add(Number(y)));
    
    // Add years from loaded database targets
    allAgentsTargets.forEach(t => {
      if (t.year) {
        yearsSet.add(Number(t.year));
      }
    });
    
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [allData, allAgentsTargets]);
  
  // Pivot data binding depending on if viewing user profile or monitoring team member
  const data = useMemo(() => {
    if (activeAgentView) {
      return {
        year: activeAgentView.year,
        overallTargetAce: activeAgentView.overallTargetAce,
        overallTargetCases: activeAgentView.overallTargetCases,
        overallTargetAcs: activeAgentView.overallTargetAcs,
        monthlyBreakdown: activeAgentView.monthlyBreakdown,
        closingRatio: activeAgentView.closingRatio || 0,
        closingRatioPresentation: activeAgentView.closingRatioPresentation || 0
      };
    }
    
    if (allData[selectedYear]) {
      return allData[selectedYear];
    }
    
    // Safe localized initialization of a dynamic year cycle
    return {
      ...INITIAL_DATA,
      year: selectedYear,
      monthlyBreakdown: INITIAL_DATA.monthlyBreakdown.map(m => ({
        ...m,
        achievedAce: 0,
        cases: 0,
        averageCaseSize: 0
      }))
    };
  }, [activeAgentView, allData, selectedYear]);

  // Sync local closing ratio state only when target or view changes in the background,
  // preventing user keystroke overrides during typing
  useEffect(() => {
    if (data) {
      if (data.closingRatio !== undefined) {
        setLocalClosingRatio(data.closingRatio > 0 ? data.closingRatio.toString() : '');
      } else {
        setLocalClosingRatio('');
      }
      if (data.closingRatioPresentation !== undefined) {
        setLocalClosingRatioPresentation(data.closingRatioPresentation > 0 ? data.closingRatioPresentation.toString() : '');
      } else {
        setLocalClosingRatioPresentation('');
      }
    } else {
      setLocalClosingRatio('');
      setLocalClosingRatioPresentation('');
    }
  }, [selectedYear, activeAgentView, data.closingRatio, data.closingRatioPresentation]);

  const handleSaveData = async (newData: BusinessTarget) => {
    // Save locally
    setAllData(prev => ({
      ...prev,
      [newData.year]: newData
    }));
    setSelectedYear(newData.year);

    // Sync upward recursively
    if (user) {
      setIsSyncing(true);
      try {
        const targetId = `${user.uid}_${newData.year}`;
        const targetRef = doc(db, 'agent_targets', targetId);
        await setDoc(targetRef, {
          targetId,
          agentId: user.uid,
          agentName: customAgentName || user.displayName || user.email?.split('@')[0] || "Ejen",
          agentEmail: user.email || "",
          year: newData.year,
          overallTargetAce: newData.overallTargetAce,
          overallTargetCases: newData.overallTargetCases,
          overallTargetAcs: newData.overallTargetAcs,
          monthlyBreakdown: newData.monthlyBreakdown,
          closingRatio: newData.closingRatio || 0,
          closingRatioPresentation: newData.closingRatioPresentation || 0,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `agent_targets/${user.uid}_${newData.year}`);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleUpdateName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setIsSyncing(true);
    try {
      if (simulatedLead) {
        // If we are in simulated/mock mode, update the mock states directly
        const targetIdToFind = editingAgentId;
        if (targetIdToFind) {
          setAllAgents(prev => prev.map(agent => 
            agent.agentId === targetIdToFind ? { ...agent, name: trimmed } : agent
          ));
          setAllAgentsTargets(prev => prev.map(target => 
            target.agentId === targetIdToFind ? { ...target, agentName: trimmed } : target
          ));
          
          if (activeAgentView && activeAgentView.agentId === targetIdToFind) {
            setActiveAgentView(prev => prev ? { ...prev, agentName: trimmed } : null);
          }
        }
        setIsEditingName(false);
        setEditingAgentId(null);
        setEditingAgentEmail(null);
        return;
      }

      if (!user) return;

      const targetAgentId = editingAgentId || user.uid;
      const targetAgentEmail = editingAgentEmail || user.email || "";

      // 1. Update agents profile document in firestore
      const agentRef = doc(db, 'agents', targetAgentId);
      const agentSnap = await getDoc(agentRef);
      if (agentSnap.exists()) {
        await updateDoc(agentRef, {
          name: trimmed,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(agentRef, {
          agentId: targetAgentId,
          name: trimmed,
          email: targetAgentEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // 2. Update agent_targets document in firestore
      const targetId = `${targetAgentId}_${selectedYear}`;
      const targetRef = doc(db, 'agent_targets', targetId);
      const targetSnap = await getDoc(targetRef);
      if (targetSnap.exists()) {
        const targetData = targetSnap.data();
        await updateDoc(targetRef, {
          agentName: trimmed,
          updatedAt: serverTimestamp()
        });
        
        // If active viewing, sync local active view
        if (activeAgentView && activeAgentView.agentId === targetAgentId) {
          setActiveAgentView({
            ...targetData,
            targetId,
            agentId: targetAgentId,
            agentName: trimmed,
            agentEmail: targetAgentEmail,
          } as any);
        }
      }

      if (targetAgentId === user.uid) {
        setCustomAgentName(trimmed);
      }
      
      setIsEditingName(false);
      setEditingAgentId(null);
      setEditingAgentEmail(null);
    } catch (e) {
      console.error("Gagal mengemaskini nama:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const getActiveRemainingMonthIdx = () => {
    const now = new Date();
    const currentFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    
    if (selectedYear > currentFY) {
      // Future year: all 12 months are in the future
      return 0;
    } else if (selectedYear < currentFY) {
      // Past year: already ended
      return 12;
    } else {
      // Current year: calculate current month index (0 to 11) starting April
      return (now.getMonth() - 3 + 12) % 12;
    }
  };

  const realignTargets = () => {
    if (activeAgentView) return; // Read-only safeguard

    const targetIdx = getActiveRemainingMonthIdx();
    const monthsRemaining = data.monthlyBreakdown.filter((_, idx) => idx >= targetIdx);
    
    if (monthsRemaining.length === 0) return;

    const totalAchievedSoFar = data.monthlyBreakdown.reduce((sum, m, idx) => idx < targetIdx ? sum + m.achievedAce : sum, 0);
    const totalCasesSoFar = data.monthlyBreakdown.reduce((sum, m, idx) => idx < targetIdx ? sum + m.cases : sum, 0);

    const remainingTarget = Math.max(0, data.overallTargetAce - totalAchievedSoFar);
    const newMonthlyTarget = Math.round(remainingTarget / monthsRemaining.length);

    const remainingCases = Math.max(0, data.overallTargetCases - totalCasesSoFar);
    const newMonthlyCases = data.overallTargetAcs > 0 
      ? Math.round(newMonthlyTarget / data.overallTargetAcs) 
      : Math.round(remainingCases / monthsRemaining.length);

    const updatedMonthly = data.monthlyBreakdown.map((m, idx) => ({
      ...m,
      targetAce: idx >= targetIdx ? newMonthlyTarget : m.targetAce,
      targetCases: idx >= targetIdx ? newMonthlyCases : m.targetCases,
    }));

    handleSaveData({
      ...data,
      monthlyBreakdown: updatedMonthly
    });
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2000);
  };

  const resetDistribution = () => {
    if (activeAgentView) return; // Read-only safeguard
    if (!confirm("Adakah anda pasti untuk menetapkan semula pembahagian sasaran bulanan kepada nilai asal (pembahagian rata)? Data pencapaian sedia ada tidak akan hilang.")) return;

    const monthlyAce = Math.round(data.overallTargetAce / 12);
    const monthlyCases = Math.round(data.overallTargetCases / 12);
    
    const updatedMonthly = data.monthlyBreakdown.map(m => ({
      ...m,
      targetAce: monthlyAce,
      targetCases: monthlyCases,
    }));

    handleSaveData({
      ...data,
      monthlyBreakdown: updatedMonthly
    });
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2000);
  };

  // Financial month logic (April start)
  const currentMonthDate = new Date();
  const currentMonthIdx = (currentMonthDate.getMonth() - 3 + 12) % 12;

  const { stats, alerts } = useMemo(() => {
    const totalAchievedAce = data.monthlyBreakdown.reduce((sum, m) => sum + m.achievedAce, 0);
    const totalCases = data.monthlyBreakdown.reduce((sum, m) => sum + m.cases, 0);
    const totalTargetCases = data.monthlyBreakdown.reduce((sum, m) => sum + m.targetCases, 0);
    const gap = data.overallTargetAce - totalAchievedAce;
    const progress = data.overallTargetAce > 0 ? (totalAchievedAce / data.overallTargetAce) : 0;
    
    const avgCaseSize = totalCases > 0
      ? Math.round(totalAchievedAce / totalCases)
      : 0;

    // Identify months with significant gaps (only for past months or current)
    const significantGaps = data.monthlyBreakdown
      .slice(0, currentMonthIdx + 1)
      .filter(m => {
        const aceGap = m.targetAce - m.achievedAce;
        const caseGap = m.targetCases - m.cases;
        return aceGap > (m.targetAce * 0.1) || caseGap > 0;
      })
      .map(m => ({
        month: m.month,
        aceGap: m.targetAce - m.achievedAce,
        caseGap: m.targetCases - m.cases,
        severity: (m.targetAce - m.achievedAce) > (m.targetAce * 0.3) ? 'high' : 'medium'
      }));

    return {
      stats: {
        totalAchievedAce,
        totalCases,
        totalTargetCases,
        gap,
        progress,
        avgCaseSize
      },
      alerts: significantGaps
    };
  }, [data, currentMonthIdx]);

  // Aggregate stats of group for Leaderboard Console
  const groupStats = useMemo(() => {
    // Filter active targets that match selectedYear using robust type comparison
    // Exclude only the group leader (afyan.ikhlas@gmail.com)
    const filtered = allAgentsTargets.filter(t => {
      const yearMatch = Number(t.year) === Number(selectedYear);
      const isLeadTarget = t.agentEmail?.toLowerCase() === 'afyan.ikhlas@gmail.com';
      return yearMatch && !isLeadTarget;
    });
    
    // Filter registered agents to exclude the leader
    const registeredAgentsFiltered = allAgents.filter(agent => {
      const isLeadAgent = agent.email?.toLowerCase() === 'afyan.ikhlas@gmail.com';
      return !isLeadAgent;
    });

    // Total agents count is either from the live registered agents list, or from targets as fallback
    const totalAgentsCount = simulatedLead 
      ? new Set(filtered.map(t => t.agentId)).size
      : Math.max(registeredAgentsFiltered.length, new Set(filtered.map(t => t.agentId)).size);

    const aggregateTargetAce = filtered.reduce((sum, t) => sum + (t.overallTargetAce || 0), 0);
    const aggregateAchievedAce = filtered.reduce((sum, t) => {
      return sum + (t.monthlyBreakdown?.reduce((mSum: number, m: any) => mSum + (m.achievedAce || 0), 0) || 0);
    }, 0);
    
    const aggregateCases = filtered.reduce((sum, t) => {
      return sum + (t.monthlyBreakdown?.reduce((mSum: number, m: any) => mSum + (m.cases || 0), 0) || 0);
    }, 0);

    const aggregateTargetCases = filtered.reduce((sum, t) => {
      return sum + (t.monthlyBreakdown?.reduce((mSum: number, m: any) => mSum + (m.targetCases || 0), 0) || 0);
    }, 0);

    const averageCaseSize = aggregateCases > 0 ? Math.round(aggregateAchievedAce / aggregateCases) : 0;
    const totalProgress = aggregateTargetAce > 0 ? (aggregateAchievedAce / aggregateTargetAce) : 0;

    return {
      agentsCount: totalAgentsCount,
      targetAce: aggregateTargetAce,
      achievedAce: aggregateAchievedAce,
      cases: aggregateCases,
      targetCases: aggregateTargetCases,
      avgCaseSize: averageCaseSize,
      progress: totalProgress,
      filteredTargets: filtered
    };
  }, [allAgentsTargets, allAgents, selectedYear, simulatedLead]);

  // Merge registered agents with their year targets (to ensure even unregistered targets show on scoreboard)
  const integratedScoreboardTargets = useMemo(() => {
    // Filter active targets that match selectedYear using robust type comparison and exclude leader
    const filtered = allAgentsTargets.filter(t => {
      const yearMatch = Number(t.year) === Number(selectedYear);
      const isLeadTarget = t.agentEmail?.toLowerCase() === 'afyan.ikhlas@gmail.com';
      return yearMatch && !isLeadTarget;
    });
    
    if (simulatedLead) {
      return filtered;
    }
    
    // Filter registered agents to exclude the leader
    const registeredAgentsFiltered = allAgents.filter(agent => {
      const isLeadAgent = agent.email?.toLowerCase() === 'afyan.ikhlas@gmail.com';
      return !isLeadAgent;
    });

    let list = registeredAgentsFiltered.map(agent => {
      const existingTarget = filtered.find(t => 
        (t.agentId && agent.agentId && t.agentId === agent.agentId) || 
        (t.agentEmail && agent.email && t.agentEmail.toLowerCase() === agent.email.toLowerCase())
      );
      if (existingTarget) {
        return existingTarget;
      }
      
      // Construct an uninitialized placeholder target
      return {
        targetId: `uninitialized_${agent.agentId}_${selectedYear}`,
        agentId: agent.agentId,
        agentName: agent.name || agent.email?.split('@')[0] || "Ejen",
        agentEmail: agent.email || "",
        year: selectedYear,
        overallTargetAce: 0,
        overallTargetCases: 0,
        overallTargetAcs: 0,
        uninitialized: true,
        monthlyBreakdown: MONTH_FULL_NAMES.map(mName => ({
          month: mName,
          targetAce: 0,
          achievedAce: 0,
          targetCases: 0,
          cases: 0,
          averageCaseSize: 0
        }))
      };
    });

    if (!isLead && !simulatedLead && user) {
      list = list.filter(t => t.agentId === user.uid);
    }

    return list;
  }, [allAgents, allAgentsTargets, selectedYear, simulatedLead, user, isLead, MONTH_FULL_NAMES]);

  const sortedScoreboardTargets = useMemo(() => {
    const list = [...integratedScoreboardTargets];
    if (scoreboardType === 'annual') {
      return list.sort((a, b) => {
        const aAchieved = a.monthlyBreakdown?.reduce((sum: number, m: any) => sum + (m.achievedAce || 0), 0) || 0;
        const bAchieved = b.monthlyBreakdown?.reduce((sum: number, m: any) => sum + (m.achievedAce || 0), 0) || 0;
        return bAchieved - aAchieved;
      });
    } else {
      return list.sort((a, b) => {
        const aMonth = a.monthlyBreakdown?.[selectedScoreboardMonthIdx];
        const bMonth = b.monthlyBreakdown?.[selectedScoreboardMonthIdx];
        const aAchieved = aMonth ? (aMonth.achievedAce || 0) : 0;
        const bAchieved = bMonth ? (bMonth.achievedAce || 0) : 0;
        return bAchieved - aAchieved;
      });
    }
  }, [integratedScoreboardTargets, scoreboardType, selectedScoreboardMonthIdx]);

  const getShareUrl = () => {
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin + window.location.pathname;
  };

  const copyShareLink = async () => {
    const shareUrl = getShareUrl();
    let copiedSuccessfully = false;
    
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copiedSuccessfully = true;
      } catch (e) {
        console.warn("navigator.clipboard failed, trying fallback:", e);
      }
    }

    if (!copiedSuccessfully) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.top = "0";
        textarea.style.left = "0";
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copiedSuccessfully = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch (err) {
        console.error("Clipboard fallback failed:", err);
      }
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const seedSimulationData = () => {
    const mockTargets = [
      {
        targetId: "mock_ejen_1_" + selectedYear,
        agentId: "mock_ejen_1",
        agentName: "Ejen Akmal Hakim",
        agentEmail: "akmal.infaq@gmail.com",
        year: selectedYear,
        overallTargetAce: 150000,
        overallTargetCases: 45,
        overallTargetAcs: 3333,
        closingRatio: 5,
        closingRatioPresentation: 15,
        updatedAt: null,
        monthlyBreakdown: [
          { month: 'Apr', targetAce: 12500, achievedAce: 15600, targetCases: 4, cases: 5 },
          { month: 'Mei', targetAce: 12500, achievedAce: 11000, targetCases: 4, cases: 3 },
          { month: 'Jun', targetAce: 12500, achievedAce: 18450, targetCases: 4, cases: 6 },
          { month: 'Jul', targetAce: 12500, achievedAce: 13000, targetCases: 4, cases: 4 },
          { month: 'Ogos', targetAce: 12500, achievedAce: 9200, targetCases: 4, cases: 2 },
          { month: 'Sep', targetAce: 12500, achievedAce: 0, targetCases: 4, cases: 0 },
          { month: 'Okt', targetAce: 12500, achievedAce: 0, targetCases: 4, cases: 0 },
          { month: 'Nov', targetAce: 12500, achievedAce: 0, targetCases: 4, cases: 0 },
          { month: 'Dis', targetAce: 12500, achievedAce: 0, targetCases: 4, cases: 0 },
          { month: 'Jan', targetAce: 12500, achievedAce: 0, targetCases: 4, cases: 0 },
          { month: 'Feb', targetAce: 12500, achievedAce: 0, targetCases: 4, cases: 0 },
          { month: 'Mac', targetAce: 12500, achievedAce: 0, targetCases: 4, cases: 0 },
        ]
      },
      {
        targetId: "mock_ejen_2_" + selectedYear,
        agentId: "mock_ejen_2",
        agentName: "Ejen Farah Nabilah",
        agentEmail: "farah.infaq@gmail.com",
        year: selectedYear,
        overallTargetAce: 240000,
        overallTargetCases: 80,
        overallTargetAcs: 3000,
        closingRatio: 10,
        closingRatioPresentation: 20,
        updatedAt: null,
        monthlyBreakdown: [
          { month: 'Apr', targetAce: 20000, achievedAce: 22000, targetCases: 7, cases: 8 },
          { month: 'Mei', targetAce: 20000, achievedAce: 25050, targetCases: 7, cases: 9 },
          { month: 'Jun', targetAce: 20000, achievedAce: 19500, targetCases: 7, cases: 6 },
          { month: 'Jul', targetAce: 20000, achievedAce: 21000, targetCases: 7, cases: 7 },
          { month: 'Ogos', targetAce: 20000, achievedAce: 15200, targetCases: 7, cases: 4 },
          { month: 'Sep', targetAce: 20000, achievedAce: 0, targetCases: 7, cases: 0 },
          { month: 'Okt', targetAce: 20000, achievedAce: 0, targetCases: 7, cases: 0 },
          { month: 'Nov', targetAce: 20000, achievedAce: 0, targetCases: 7, cases: 0 },
          { month: 'Dis', targetAce: 20000, achievedAce: 0, targetCases: 7, cases: 0 },
          { month: 'Jan', targetAce: 20000, achievedAce: 0, targetCases: 7, cases: 0 },
          { month: 'Feb', targetAce: 20000, achievedAce: 0, targetCases: 7, cases: 0 },
          { month: 'Mac', targetAce: 20000, achievedAce: 0, targetCases: 7, cases: 0 },
        ]
      },
      {
        targetId: "mock_ejen_3_" + selectedYear,
        agentId: "mock_ejen_3",
        agentName: "Ejen Syazwan Rosli",
        agentEmail: "syazwan.infaq@gmail.com",
        year: selectedYear,
        overallTargetAce: 120000,
        overallTargetCases: 40,
        overallTargetAcs: 3000,
        closingRatio: 8,
        closingRatioPresentation: 25,
        updatedAt: null,
        monthlyBreakdown: [
          { month: 'Apr', targetAce: 10000, achievedAce: 8000, targetCases: 3, cases: 2 },
          { month: 'Mei', targetAce: 10000, achievedAce: 9000, targetCases: 3, cases: 3 },
          { month: 'Jun', targetAce: 10000, achievedAce: 12000, targetCases: 3, cases: 4 },
          { month: 'Jul', targetAce: 10000, achievedAce: 14000, targetCases: 3, cases: 5 },
          { month: 'Ogos', targetAce: 10000, achievedAce: 5000, targetCases: 3, cases: 1 },
          { month: 'Sep', targetAce: 10000, achievedAce: 0, targetCases: 3, cases: 0 },
          { month: 'Okt', targetAce: 10000, achievedAce: 0, targetCases: 3, cases: 0 },
          { month: 'Nov', targetAce: 10000, achievedAce: 0, targetCases: 3, cases: 0 },
          { month: 'Dis', targetAce: 10000, achievedAce: 0, targetCases: 3, cases: 0 },
          { month: 'Jan', targetAce: 10000, achievedAce: 0, targetCases: 3, cases: 0 },
          { month: 'Feb', targetAce: 10000, achievedAce: 0, targetCases: 3, cases: 0 },
          { month: 'Mac', targetAce: 10000, achievedAce: 0, targetCases: 3, cases: 0 },
        ]
      }
    ];
    setAllAgentsTargets(mockTargets);
    setAllAgents([
      { agentId: "mock_ejen_1", name: "Ejen Akmal Hakim", email: "akmal.infaq@gmail.com" },
      { agentId: "mock_ejen_2", name: "Ejen Farah Nabilah", email: "farah.infaq@gmail.com" },
      { agentId: "mock_ejen_3", name: "Ejen Syazwan Rosli", email: "syazwan.infaq@gmail.com" }
    ]);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1 
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Visual Status Indicator for monitoring remote agents */}
      <AnimatePresence>
        {activeAgentView && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-emerald-950 text-emerald-100 flex-shrink-0"
          >
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-800/40 rounded-xl border border-emerald-700/50">
                  <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-black tracking-widest text-emerald-400">Mod Pemerhatian Ahli</p>
                  <h4 className="text-sm font-bold text-white leading-none mt-1">
                    Sedang Memantau Goal Tracker: <span className="text-emerald-300 font-black">{activeAgentView.agentName}</span> ({activeAgentView.agentEmail})
                  </h4>
                </div>
              </div>
              <button 
                onClick={() => {
                  setActiveAgentView(null);
                  setActiveTab('team');
                }}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white font-black text-xs uppercase tracking-wider py-1.5 px-4 rounded-xl border border-white/10"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali Ke Dashboard Saya
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="h-16 px-4 md:px-8 flex items-center justify-between bg-emerald-900 text-white flex-shrink-0 relative z-30 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-emerald-400 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Target className="w-6 h-6 text-emerald-900" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">Goal Tracker Pro</h1>
            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5">by INFAQ Consultancy</p>
          </div>
        </div>

        {/* Firebase Account & Sync Console Toolbar */}
        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="hidden lg:block text-right">
            <p className="text-[10px] opacity-70 uppercase tracking-widest font-bold">Kitaran Sukan Bisnes</p>
            <p className="text-sm font-medium">April - Mac</p>
          </div>

          <div className="h-10 bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-2.5 md:px-3.5 flex items-center gap-3.5">
            {isAuthLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-200">Menyambung...</span>
              </div>
            ) : user ? (
              <div className="flex items-center gap-3.5">
                <div className="flex flex-col items-end leading-none">
                  <span className="text-xs font-black text-white max-w-[120px] truncate">{customAgentName || user.displayName || user.email?.split('@')[0]}</span>
                  <span className="text-[10px] text-emerald-400 font-bold tracking-wider uppercase mt-1">
                    {(isLead || simulatedLead) ? "Ketua Kumpulan" : "Ejen"}
                  </span>
                </div>
                {/* Visual Cloud State Indicators */}
                <div className="relative">
                  <div className="w-7 h-7 rounded-lg bg-emerald-800 flex items-center justify-center border border-emerald-700 overflow-hidden font-black text-xs text-emerald-300">
                    {user.email?.[0].toUpperCase()}
                  </div>
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-emerald-900" />
                </div>
                <button 
                  onClick={logoutUser}
                  title="Log Keluar"
                  className="p-1.5 hover:bg-emerald-800/80 rounded-lg text-emerald-300 hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={loginWithGoogle}
                className="flex items-center gap-2 text-white hover:text-emerald-300 transition-colors py-1 px-2 text-xs font-black uppercase tracking-wider"
              >
                <LogIn className="w-4 h-4 text-emerald-400" />
                <span>Log Masuk Ejen</span>
              </button>
            )}
          </div>
        </div>
      </nav>


      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-12 flex-grow">
        <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              {activeAgentView ? `Ringkasan Bisnes: ${activeAgentView.agentName}` : (customAgentName ? `Ringkasan Bisnes: ${customAgentName}` : "Ringkasan Bisnes Saya")} ({formatFY(data.year)})
              {(activeAgentView ? (isLead || simulatedLead) : !!user) && (
                <button 
                  onClick={() => {
                    if (activeAgentView) {
                      setEditedName(activeAgentView.agentName || "");
                      setEditingAgentId(activeAgentView.agentId);
                      setEditingAgentEmail(activeAgentView.agentEmail);
                    } else {
                      setEditedName(customAgentName || user?.displayName || user?.email?.split('@')[0] || "Ejen");
                      setEditingAgentId(null);
                      setEditingAgentEmail(null);
                    }
                    setIsEditingName(true);
                  }}
                  title="Kemaskini Nama Ejen"
                  className="p-1.5 hover:bg-slate-200/60 active:scale-95 text-slate-400 hover:text-emerald-700 rounded-lg transition-all"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
            </h2>
            <p className="text-slate-500 text-sm">
              {activeAgentView ? `Memantau pencapaian KPI ejen ${activeAgentView.agentEmail}` : "Dashboard prestasi pencapaian kpi peribadi | Kitaran: April - Mac"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button 
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/60 hover:bg-emerald-100 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm uppercase tracking-wider active:scale-95"
            >
              <Share2 className="w-4 h-4 text-emerald-600 animate-bounce" />
              Kongsi App
            </button>

            <div className="relative group">
              <select 
                disabled={!!activeAgentView}
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className={cn(
                  "appearance-none bg-white border border-slate-200 pl-10 pr-8 py-2.5 rounded-xl text-xs font-bold text-slate-600 shadow-sm uppercase tracking-wider cursor-pointer focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all",
                  activeAgentView && "bg-slate-100/50 cursor-not-allowed opacity-75"
                )}
              >
                {years.map(y => (
                  <option key={y} value={y}>{formatFY(y)}</option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Calendar className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight className="w-3 h-3 text-slate-400 rotate-90" />
              </div>
            </div>

            <button 
              disabled={!!activeAgentView}
              onClick={resetDistribution}
              className={cn(
                "flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors shadow-sm uppercase tracking-wider group",
                activeAgentView && "opacity-40 cursor-not-allowed"
              )}
            >
              <RefreshCw className="w-4 h-4 group-active:-rotate-180 transition-transform text-slate-400" />
              Set Semula
            </button>

            <button 
              disabled={!!activeAgentView}
              onClick={realignTargets}
              className={cn(
                "flex items-center gap-2 bg-white border border-emerald-200 px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors shadow-sm uppercase tracking-wider group",
                activeAgentView && "opacity-40 cursor-not-allowed"
              )}
            >
              <RefreshCw className="w-4 h-4 group-active:rotate-180 transition-transform" />
              Laras Semula
            </button>

            <button 
              disabled={!!activeAgentView}
              onClick={() => {
                setIsFormOpen(true);
              }}
              className={cn(
                "flex items-center gap-2 bg-emerald-600 px-4 py-2.5 rounded-xl text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-200 uppercase tracking-wider relative overflow-hidden active:scale-95",
                activeAgentView && "bg-slate-300 shadow-none border-slate-300 hover:bg-slate-300 cursor-not-allowed text-slate-500"
              )}
            >
              <Edit3 className="w-4 h-4" />
              {activeAgentView ? "Mod Tontonan" : "Kemaskini Data"}
              {showSaveSuccess && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 bg-white flex items-center justify-center text-emerald-700 text-[10px] uppercase font-black"
                >
                  Tersimpan!
                </motion.div>
              )}
            </button>
          </div>
        </header>

        {activeAgentView && (isLead || simulatedLead) && (
          <div className="mb-6 bg-amber-50/70 border border-amber-200/50 p-4 rounded-xl flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-800">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-grow">
              <div className="flex items-center justify-between gap-4">
                <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">Nota Khas Admin (Lead)</h4>
                <button
                  onClick={() => {
                    const noteVal = simulatedLead 
                      ? (simulatedNotes[activeAgentView.agentId] || "") 
                      : (agentNotes[activeAgentView.agentId] || "");
                    setSelectedAgentForNote(activeAgentView);
                    setTempNoteText(noteVal);
                    setIsEditingNote(true);
                  }}
                  className="text-[10px] text-amber-700 hover:text-amber-900 font-black uppercase tracking-wider underline cursor-pointer"
                >
                  Kemaskini Nota
                </button>
              </div>
              <p className="text-xs text-amber-800 mt-1.5 whitespace-pre-line">
                {(simulatedLead ? simulatedNotes[activeAgentView.agentId] : agentNotes[activeAgentView.agentId]) || "Tiada nota khas ditulis lagi untuk ejen ini."}
              </p>
            </div>
          </div>
        )}

        {/* Dual Tab Switcher for Personal Tracking vs Team Collaboration Hub */}
        {(user || simulatedLead) && (
          <div className="flex border-b border-slate-200 mb-8 gap-5 relative z-15">
            <button
              onClick={() => setActiveTab('personal')}
              className={cn(
                "pb-3 px-1.5 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 cursor-pointer",
                activeTab === 'personal' ? "border-emerald-600 text-emerald-800" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard Peribadi
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={cn(
                "pb-3 px-1.5 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 cursor-pointer relative",
                activeTab === 'team' ? "border-emerald-600 text-emerald-800" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <Users className="w-4 h-4" />
              {(isLead || simulatedLead) ? "Konsol Kumpulan (Rangkaian)" : "Scoreboard Peribadi"}
              <span className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full select-none">
                {(isLead || simulatedLead) ? `${groupStats.agentsCount} Ejen` : "Peribadi"}
              </span>
            </button>
          </div>
        )}


        {activeTab === 'personal' ? (
          <>
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8"
          >
          <StatCard 
            title="Sasaran ACE" 
            value={formatCurrency(data.overallTargetAce)} 
            subValue={`Kitaran ${formatFY(data.year)}`}
            icon={<Target className="w-5 h-5 text-emerald-900" />}
            color="slate"
          />
          <StatCard 
            title="Total ACE Capai" 
            value={formatCurrency(stats.totalAchievedAce)} 
            subValue={`${formatPercent(stats.progress)} Prestasi`}
            icon={<TrendingUp className="w-5 h-5 text-emerald-700" />}
            color="emerald"
            progress={stats.progress}
            percentage={stats.progress >= 1 ? "DONE" : `${Math.round(stats.progress * 100)}%`}
          />
          <StatCard 
            title="Baki Gap Target" 
            value={formatCurrency(Math.max(0, stats.gap))}
            subValue={stats.gap <= 0 ? "Sasaran Tercapai!" : `Kurang ${formatCurrency(stats.gap)}`}
            icon={<AlertCircle className="w-5 h-5 text-rose-600" />}
            color="rose"
            isGap
          />
          <StatCard 
            title="Target & Jmlh Kes" 
            value={`${formatNumber(stats.totalCases)} / ${formatNumber(data.overallTargetCases)}`} 
            subValue={stats.totalCases >= data.overallTargetCases ? "Target Kes Tercapai" : `Baki ${formatNumber(data.overallTargetCases - stats.totalCases)} kes lagi`}
            icon={<Users className="w-5 h-5 text-slate-600" />}
            color="slate"
          />
          <StatCard 
            title="Purata Saiz (ACS)" 
            value={formatCurrency(stats.avgCaseSize)} 
            subValue={`Target: ${formatCurrency(data.overallTargetAcs || 2500)}+`}
            icon={<PieChart className="w-5 h-5 text-slate-600" />}
            color="slate"
          />
        </motion.div>
        
        {alerts.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {alerts.map((alert, i) => (
              <div 
                key={alert.month + i} 
                className={cn(
                  "p-4 rounded-2xl border flex items-center gap-4 shadow-sm",
                  alert.severity === 'high' ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800"
                )}
              >
                <div className={cn(
                  "p-2 rounded-xl",
                  alert.severity === 'high' ? "bg-rose-500 text-white" : "bg-amber-500 text-white"
                )}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest">{alert.month} - Gap Kritikal</p>
                  <p className="text-xs font-bold mt-0.5">
                    {alert.aceGap > 0 && `Target ACE kurang ${formatCurrency(alert.aceGap)}`}
                    {alert.aceGap > 0 && alert.caseGap > 0 && ' & '}
                    {alert.caseGap > 0 && `Kurang ${alert.caseGap} kes`}
                  </p>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Charts Section */}
          <motion.div 
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="lg:col-span-8 space-y-8"
          >
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Prestasi ACE (Target vs Sebenar)</h3>
                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <div className="w-2.5 h-2.5 rounded-sm bg-slate-200"></div>
                    Target
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></div>
                    Sebenar
                  </div>
                </div>
              </div>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.monthlyBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }}
                      tickFormatter={(val) => `RM${val/1000}k`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#F8FAFC' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-xl">
                              <p className="font-bold text-slate-900 mb-1 text-xs uppercase tracking-wider">{payload[0].payload.month}</p>
                              <div className="space-y-1">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Target: <span className="text-slate-900">{formatCurrency(payload[0].value as number)}</span></p>
                                <p className="text-[10px] text-emerald-600 uppercase font-bold">Sebenar: <span className="text-emerald-700">{formatCurrency(payload[1].value as number)}</span></p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="targetAce" name="Target ACE" fill="#F1F5F9" radius={[4, 4, 0, 0]} barSize={40} />
                    <Bar dataKey="achievedAce" name="ACE Capai" fill="#10B981" radius={[4, 4, 0, 0]} barSize={25} />
                    <Line 
                      type="monotone" 
                      dataKey="achievedAce" 
                      name="Trend Capai"
                      stroke="#059669" 
                      strokeWidth={2} 
                      dot={{ fill: '#059669', strokeWidth: 2, r: 4 }} 
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Pecahan Data Bulanan</h3>
                <div className="flex gap-1.5">
                  <div className="px-2.5 py-1 bg-emerald-900 text-white rounded text-[10px] font-bold uppercase">FY {data.year}</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4">Bulan</th>
                      <th className="px-6 py-4 text-right">Target ACE</th>
                      <th className="px-6 py-4 text-center">Tgt Kes</th>
                      <th className="px-6 py-4 text-center">Act Kes</th>
                      <th className="px-6 py-4 text-right">Purata Saiz</th>
                      <th className="px-6 py-4 text-right">ACE Capai</th>
                      <th className="px-6 py-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {data.monthlyBreakdown.map((row, idx) => {
                      const gap = row.targetAce - row.achievedAce;
                      const isPositive = row.achievedAce >= row.targetAce;
                      const caseMet = row.cases >= row.targetCases;
                      const isFuture = row.achievedAce === 0 && idx > currentMonthIdx;

                      return (
                        <tr key={row.month} className={cn(
                          "hover:bg-slate-50/50 transition-colors",
                          isPositive && !isFuture ? "bg-emerald-50/10" : ""
                        )}>
                          <td className={cn("px-6 py-4 font-semibold", isFuture ? "text-slate-400" : "text-slate-800")}>
                            {row.month} {isFuture && <span className="ml-2 py-0.5 px-1.5 bg-slate-100 text-[8px] rounded uppercase font-black text-slate-400">Future</span>}
                          </td>
                          <td className="px-6 py-4 text-right text-slate-500 font-medium">{formatCurrency(row.targetAce)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-mono text-xs font-bold text-slate-400">
                              {row.targetCases.toString().padStart(2, '0')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={cn(
                              "font-mono text-xs font-bold", 
                              isFuture ? "text-slate-300" : (caseMet ? "text-emerald-600" : "text-rose-500")
                            )}>
                              {row.cases > 0 ? row.cases.toString().padStart(2, '0') : '--'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-slate-500">{row.averageCaseSize > 0 ? formatCurrency(row.averageCaseSize) : '--'}</td>
                          <td className={cn("px-6 py-4 text-right font-bold", isFuture ? "text-slate-300" : "text-slate-800")}>
                            {row.achievedAce > 0 ? formatCurrency(row.achievedAce) : '--'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isFuture ? (
                              <span className="text-slate-300 font-bold uppercase text-[10px]">Pending</span>
                            ) : (
                              <span className={cn(
                                "font-bold uppercase text-[10px]",
                                isPositive ? "text-emerald-500" : "text-rose-400"
                              )}>
                                {isPositive ? "Over Target" : (
                                  <span className="flex flex-col items-end">
                                    <span>Under Target</span>
                                    {gap > 0 && (
                                      <span className="text-[10px] text-rose-500 font-mono mt-0.5 font-bold tracking-tight">
                                        -{formatCurrency(gap)}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50/50 border-t border-slate-200">
                    <tr className="font-black text-slate-800">
                      <td className="px-6 py-4 uppercase text-[10px] tracking-widest">Jumlah Keseluruhan</td>
                      <td className="px-6 py-4 text-right text-xs">{formatCurrency(data.overallTargetAce)}</td>
                      <td className="px-6 py-4 text-center text-xs text-slate-400">{formatNumber(stats.totalTargetCases)}</td>
                      <td className="px-6 py-4 text-center text-xs">{formatNumber(stats.totalCases)}</td>
                      <td className="px-6 py-4 text-right text-xs">{formatCurrency(stats.avgCaseSize)}</td>
                      <td className="px-6 py-4 text-right text-emerald-700">{formatCurrency(stats.totalAchievedAce)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn(
                          "uppercase text-[10px] tracking-widest p-1 rounded",
                          stats.progress >= 1 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {formatPercent(stats.progress)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </motion.div>

          {/* Sidebar Section */}
          <motion.div 
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="lg:col-span-4 space-y-6"
          >
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[480px]">
              {/* Header with Switcher */}
              <div className="mb-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest text-left">
                    Target Progress {personalProgressType === 'annual' ? `FY${data.year}` : MONTH_FULL_NAMES[selectedPersonalMonthIdx].toUpperCase()}
                  </h3>
                  
                  {/* Miniature Select for Month */}
                  {personalProgressType === 'monthly' && (
                    <div className="relative">
                      <select
                        value={selectedPersonalMonthIdx}
                        onChange={(e) => setSelectedPersonalMonthIdx(Number(e.target.value))}
                        className="bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-700 pl-2 pr-6 py-1 rounded-lg outline-none cursor-pointer appearance-none"
                      >
                        {MONTH_FULL_NAMES.map((mName, mIdx) => (
                          <option key={mIdx} value={mIdx}>
                            {mName}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronRight className="w-2.5 h-2.5 rotate-90" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Sub-tab selection */}
                <div className="bg-slate-100 p-1 rounded-xl flex items-center justify-between border border-slate-200/40">
                  <button
                    onClick={() => setPersonalProgressType('annual')}
                    className={cn(
                      "flex-1 py-1.5 px-2 text-[9px] font-black uppercase tracking-wider text-center rounded-lg transition-all cursor-pointer",
                      personalProgressType === 'annual'
                        ? "bg-white text-emerald-800 shadow-xs ring-1 ring-slate-200/50"
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Kumulatif Tahunan
                  </button>
                  <button
                    onClick={() => setPersonalProgressType('monthly')}
                    className={cn(
                      "flex-1 py-1.5 px-2 text-[9px] font-black uppercase tracking-wider text-center rounded-lg transition-all cursor-pointer",
                      personalProgressType === 'monthly'
                        ? "bg-white text-emerald-800 shadow-xs ring-1 ring-slate-200/50"
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Prestasi Bulanan
                  </button>
                </div>
              </div>

              {(() => {
                const selectedMonthData = data.monthlyBreakdown[selectedPersonalMonthIdx] || {};
                const mTargetAce = selectedMonthData.targetAce || 0;
                const mAchievedAce = selectedMonthData.achievedAce || 0;
                const mProgress = mTargetAce > 0 ? (mAchievedAce / mTargetAce) : 0;

                const activeProgress = personalProgressType === 'annual' ? stats.progress : mProgress;
                const activeTarget = personalProgressType === 'annual' ? data.overallTargetAce : mTargetAce;
                const activeAchieved = personalProgressType === 'annual' ? stats.totalAchievedAce : mAchievedAce;

                const numMonthsYtd = selectedPersonalMonthIdx + 1;
                const ytdTargetLinear = (numMonthsYtd / 12) * data.overallTargetAce;
                const ytdAchieved = data.monthlyBreakdown.slice(0, numMonthsYtd).reduce((sum, m) => sum + (m.achievedAce || 0), 0);
                const ytdProgressPercent = ytdTargetLinear > 0 ? (ytdAchieved / ytdTargetLinear) * 100 : 0;

                const targetDisplayString = activeTarget >= 1000000 
                  ? `RM ${formatNumber(Math.round(activeTarget / 1000))}K` 
                  : `RM ${formatNumber(activeTarget)}`;

                return (
                  <div className="flex-grow flex flex-col items-center justify-center relative">
                    <div className="w-56 h-56 rounded-full border-[16px] border-slate-100 flex items-center justify-center relative shadow-inner">
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle 
                          cx="50" cy="50" r="42" 
                          fill="transparent" 
                          stroke="#10B981" 
                          strokeWidth="8" 
                          strokeDasharray={`${Math.min(1, activeProgress) * 264} 264`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="text-center z-10">
                        <p className="text-5xl font-black text-slate-800 tracking-tighter">{Math.round(activeProgress * 100)}%</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Daripada {targetDisplayString}</p>
                      </div>
                    </div>
                    
                    <div className="mt-12 space-y-4 w-full">
                      <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-slate-400">
                        <span>Progres ACE:</span>
                        <span className="text-slate-800 font-bold">{formatCurrency(activeAchieved)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          key={personalProgressType}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(1, activeProgress) * 100}%` }}
                          className="h-full bg-emerald-500" 
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 mt-6">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:border-emerald-250 transition-all cursor-default">
                          <p className="text-[9px] text-slate-400 uppercase font-black">
                            {personalProgressType === 'annual' ? "Target Sebulan" : "Target Bulan Ini"}
                          </p>
                          <p className="font-black text-lg text-slate-700 group-hover:text-emerald-700">
                            {personalProgressType === 'annual' 
                              ? formatCurrency(data.overallTargetAce / 12) 
                              : formatCurrency(mTargetAce)
                            }
                          </p>
                        </div>
                      </div>

                      {/* Info Ruang Pencapaian YTD Berdasarkan Bulan */}
                      <div className="p-4 rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/20 to-teal-50/20 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-800 uppercase tracking-widest">
                            <Trophy className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                            Pencapaian YTD (April - {MONTH_FULL_NAMES[selectedPersonalMonthIdx].slice(0, 3)})
                          </span>
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full",
                            ytdProgressPercent >= 100 ? "bg-emerald-100 text-emerald-700" :
                            ytdProgressPercent >= 50 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                          )}>
                            {Math.round(ytdProgressPercent)}%
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500 font-medium">Bulan Terlibat:</span>
                            <span className="text-slate-800 font-black uppercase text-[9px]">
                              Apr - {MONTH_FULL_NAMES[selectedPersonalMonthIdx]} (Bulan {numMonthsYtd} / 12)
                            </span>
                          </div>
                          
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500 font-medium">Saranan Target YTD:</span>
                            <span className="text-slate-800 font-bold">{formatCurrency(ytdTargetLinear)}</span>
                          </div>

                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500 font-medium">Pencapaian Sebenar YTD:</span>
                            <span className="text-emerald-700 font-bold">{formatCurrency(ytdAchieved)}</span>
                          </div>
                        </div>

                        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              ytdProgressPercent >= 100 ? "bg-emerald-500" :
                              ytdProgressPercent >= 50 ? "bg-amber-500" : "bg-rose-500"
                            )}
                            style={{ width: `${Math.min(100, ytdProgressPercent)}%` }}
                          />
                        </div>

                        <p className="text-[9px] text-slate-400 font-medium leading-normal italic">
                          * Berdasarkan skala masa linear: {numMonthsYtd}/12 daripada RM {formatNumber(Math.round(data.overallTargetAce / 1000))}K target tahunan.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CLOSING RATIO Section */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Target className="w-24 h-24 text-slate-900" />
              </div>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                CLOSING RATIO
              </h3>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                Rancangan sasaran aktiviti prospek berdasarkan target bulanan yang diselaraskan bagi bulan <strong>{data.monthlyBreakdown[selectedPersonalMonthIdx]?.month}</strong>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 h-10 flex items-end">
                    Prospect Ratio
                  </label>
                  <div className="relative">
                    <input 
                      type="number"
                      min="1"
                      max="100"
                      disabled={!!activeAgentView}
                      value={localClosingRatio}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          setLocalClosingRatio('');
                        } else {
                          const val = parseInt(valStr, 10);
                          if (!isNaN(val)) {
                            const sanitizedVal = Math.min(100, Math.max(0, val));
                            setLocalClosingRatio(sanitizedVal.toString());
                          }
                        }
                      }}
                      onBlur={() => {
                        const finalVal = localClosingRatio === '' ? 0 : parseInt(localClosingRatio, 10);
                        handleSaveData({
                          ...data,
                          closingRatio: finalVal
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder="Contoh: 5"
                      className={cn(
                        "w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-lg font-extrabold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all",
                        activeAgentView && "bg-slate-100 border-slate-200/50 cursor-not-allowed select-none text-slate-400"
                      )}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold text-lg select-none">
                      %
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 h-10 flex items-end">
                    Open Case Presentation Ratio
                  </label>
                  <div className="relative">
                    <input 
                      type="number"
                      min="1"
                      max="100"
                      disabled={!!activeAgentView}
                      value={localClosingRatioPresentation}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          setLocalClosingRatioPresentation('');
                        } else {
                          const val = parseInt(valStr, 10);
                          if (!isNaN(val)) {
                            const sanitizedVal = Math.min(100, Math.max(0, val));
                            setLocalClosingRatioPresentation(sanitizedVal.toString());
                          }
                        }
                      }}
                      onBlur={() => {
                        const finalVal = localClosingRatioPresentation === '' ? 0 : parseInt(localClosingRatioPresentation, 10);
                        handleSaveData({
                          ...data,
                          closingRatioPresentation: finalVal
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder="Contoh: 20"
                      className={cn(
                        "w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-lg font-extrabold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all",
                        activeAgentView && "bg-slate-100 border-slate-200/50 cursor-not-allowed select-none text-slate-400"
                      )}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold text-lg select-none">
                      %
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const closingRatio = localClosingRatio !== '' ? parseInt(localClosingRatio, 10) : (data.closingRatio || 0);
                const closingRatioPresentation = localClosingRatioPresentation !== '' ? parseInt(localClosingRatioPresentation, 10) : (data.closingRatioPresentation || 0);

                if (closingRatio > 0 || closingRatioPresentation > 0) {
                  const selectedMonthData = data.monthlyBreakdown[selectedPersonalMonthIdx] || {};
                  const realignedMonthlyAce = selectedMonthData.targetAce || 0;
                  const targetAcs = data.overallTargetAcs || 2500;
                  const casesToClose = targetAcs > 0 ? Math.ceil(realignedMonthlyAce / targetAcs) : 0;

                  return (
                    <div className="space-y-6 relative z-10">
                      {/* Formula breakdown */}
                      <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-100/60 border-dashed text-emerald-800 font-sans">
                        <p className="text-[10px] font-black uppercase tracking-wider mb-1 text-emerald-700">Formula Pengiraan Aktiviti</p>
                        <div className="space-y-1 font-mono text-[11px] font-bold text-emerald-800 leading-normal">
                          <div>
                            1. Bilangan Kes: RM {formatNumber(realignedMonthlyAce)} / RM {formatNumber(targetAcs)} = <span className="underline">{casesToClose} Kes</span>
                          </div>
                          {closingRatio > 0 && (
                            <div>
                              2. Target Prospek: {casesToClose} / {closingRatio}% = <span className="underline">{Math.ceil(casesToClose / (closingRatio / 100))} Sebulan</span>
                            </div>
                          )}
                          {closingRatioPresentation > 0 && (
                            <div>
                              3. Target Open Case: {casesToClose} / {closingRatioPresentation}% = <span className="underline">{Math.ceil(casesToClose / (closingRatioPresentation / 100))} Sebulan</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[9px] text-emerald-600 mt-2 leading-normal">
                          * Bilangan kes diperoleh daripada Sasaran ACE / Sasaran ACS. Sasaran aktiviti dibundarkan ke angka bulat tertinggi.
                        </p>
                      </div>

                      {/* We show columns or sections for Prospek and Open Case Presentation */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Column 1: Target Prospek */}
                        {closingRatio > 0 ? (
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                              Aktiviti Prospek Baru
                            </h4>
                            {(() => {
                              const prospectsMonth = Math.ceil(casesToClose / (closingRatio / 100));
                              const prospectsWeek = Math.ceil(prospectsMonth / 4);
                              const prospectsDay = Math.ceil(prospectsWeek / 6);

                              return (
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center p-3 bg-slate-50 hover:bg-slate-100/50 rounded-xl border border-slate-100 transition-colors">
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Bulanan</p>
                                      <p className="text-[8px] text-slate-500 italic font-medium">({casesToClose} Kes / {closingRatio}%)</p>
                                    </div>
                                    <p className="text-base font-black text-slate-800">
                                      {formatNumber(prospectsMonth)} <span className="text-[10px] font-bold text-slate-400">orang</span>
                                    </p>
                                  </div>

                                  <div className="flex justify-between items-center p-3 bg-slate-50 hover:bg-slate-100/50 rounded-xl border border-slate-100 transition-colors">
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Mingguan</p>
                                      <p className="text-[8px] text-slate-500 italic font-medium">(Formula: Bulanan / 4)</p>
                                    </div>
                                    <p className="text-base font-black text-slate-800">
                                      {formatNumber(prospectsWeek)} <span className="text-[10px] font-bold text-slate-400">orang</span>
                                    </p>
                                  </div>

                                  <div className="flex justify-between items-center p-3 bg-emerald-50/25 hover:bg-emerald-50/40 rounded-xl border border-emerald-100/60 transition-colors">
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Harian</p>
                                      <p className="text-[8px] text-slate-500 italic font-medium">(6 Hari Kerja: Mingguan / 6)</p>
                                    </div>
                                    <p className="text-base font-black text-emerald-700">
                                      {formatNumber(prospectsDay)} <span className="text-[10px] font-bold text-emerald-500">orang</span>
                                    </p>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 border-dashed flex flex-col items-center justify-center text-center min-h-[160px]">
                            <p className="text-[10px] text-slate-400 font-medium">
                              Masukkan Closing Ratio % untuk melihat sasaran prospek baru yang diperlukan.
                            </p>
                          </div>
                        )}

                        {/* Column 2: Target Open Case Presentation */}
                        {closingRatioPresentation > 0 ? (
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                              Aktiviti Open Case Presentation
                            </h4>
                            {(() => {
                              const presentationsMonth = Math.ceil(casesToClose / (closingRatioPresentation / 100));
                              const presentationsWeek = Math.ceil(presentationsMonth / 4);
                              const presentationsDay = Math.ceil(presentationsWeek / 6);

                              return (
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center p-3 bg-slate-50 hover:bg-slate-100/50 rounded-xl border border-slate-100 transition-colors">
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Bulanan</p>
                                      <p className="text-[8px] text-slate-500 italic font-medium">({casesToClose} Kes / {closingRatioPresentation}%)</p>
                                    </div>
                                    <p className="text-base font-black text-slate-800">
                                      {formatNumber(presentationsMonth)} <span className="text-[10px] font-bold text-slate-400">kali</span>
                                    </p>
                                  </div>

                                  <div className="flex justify-between items-center p-3 bg-slate-50 hover:bg-slate-100/50 rounded-xl border border-slate-100 transition-colors">
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Mingguan</p>
                                      <p className="text-[8px] text-slate-500 italic font-medium">(Formula: Bulanan / 4)</p>
                                    </div>
                                    <p className="text-base font-black text-slate-800">
                                      {formatNumber(presentationsWeek)} <span className="text-[10px] font-bold text-slate-400">kali</span>
                                    </p>
                                  </div>

                                  <div className="flex justify-between items-center p-3 bg-blue-50/25 hover:bg-blue-50/40 rounded-xl border border-blue-100/60 transition-colors">
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Harian</p>
                                      <p className="text-[8px] text-slate-500 italic font-medium">(6 Hari Kerja: Mingguan / 6)</p>
                                    </div>
                                    <p className="text-base font-black text-blue-700">
                                      {formatNumber(presentationsDay)} <span className="text-[10px] font-bold text-blue-500">kali</span>
                                    </p>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 border-dashed flex flex-col items-center justify-center text-center min-h-[160px]">
                            <p className="text-[10px] text-slate-400 font-medium">
                              Masukkan Open Case Presentation % untuk melihat sasaran presentation yang diperlukan.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 border-dashed text-center">
                      <p className="text-xs text-slate-400 font-medium">
                        Masukkan kadar closing anda di atas untuk memaparkan pelan tindakan sasaran aktiviti bulanan, mingguan dan harian yang diperlukan.
                      </p>
                    </div>
                  );
                }
              })()}
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <AlertCircle className="w-24 h-24 text-slate-900" />
              </div>
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-emerald-600" />
                Syor Tindakan
              </h3>
              <div className="space-y-4 relative z-10">
                <ActionItem 
                  title="Gap ACE Kritikal" 
                  desc={`Anda perlu mengecilkan jurang sebanyak ${formatCurrency(stats.gap)} dalam bulan berbaki.`}
                  status="urgent"
                />
                {stats.gap > 0 && (
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 border-dashed">
                    <p className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider mb-2">Syor Penyelarasan</p>
                    <p className="text-[10px] text-emerald-600 leading-relaxed mb-3">Klik butang di bawah untuk membahagi baki target secara rata ke bulan-bulan akan datang.</p>
                    <button 
                      onClick={realignTargets}
                      className="w-full py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Laras Sekarang
                    </button>
                  </div>
                )}
                <ActionItem 
                  title="Prestasi Setakat Ini" 
                  desc="Kekalkan momentum untuk memastikan sasaran tahunan tercapai."
                  status="info"
                />
              </div>
            </div>
          </motion.div>
        </div>
          </>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8"
          >
            {/* Simulation Banner */}
            {(!isLead) && (
              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fadeIn">
                <div className="flex gap-4 items-start text-center md:text-left flex-col sm:flex-row">
                  <div className="p-3 bg-amber-500/10 rounded-xl text-amber-700 mx-auto sm:mx-0">
                    <ShieldAlert className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-amber-950 uppercase tracking-wide">Akses Simulasi Konsol Kumpulan</h4>
                    <p className="text-xs text-amber-700 mt-1 leading-relaxed max-w-2xl">
                      Fungsi ini dikhaskan untuk Ketua Infaq (<strong>afyan.ikhlas@gmail.com</strong>). Walau bagaimanapun, anda boleh mengaktifkan <strong>Mod Simulasi</strong> sekarang untuk memantau data ejen secara langsung!
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSimulatedLead(!simulatedLead);
                    if (!simulatedLead && allAgentsTargets.length === 0) {
                      seedSimulationData();
                    }
                  }}
                  className={cn(
                    "w-full md:w-auto px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm border text-white text-center border-0",
                    simulatedLead ? "bg-amber-600 hover:bg-amber-700 border-amber-500" : "bg-slate-900 border-slate-900 hover:bg-slate-800"
                  )}
                >
                  {simulatedLead ? "Nyahaktif Simulasi" : "Aktifkan Simulasi"}
                </button>
              </div>
            )}

            {/* Agregat Stats Grid (Group KPI Key indicators) */}
            {(isLead || simulatedLead) && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                  title="Ejen Berdaftar" 
                  value={String(groupStats.agentsCount)} 
                  subValue="Dalam Rangkaian Agensi"
                  icon={<Users className="w-5 h-5 text-slate-800" />}
                  color="slate"
                />
                <StatCard 
                  title="Jumlah Kumpulan ACE" 
                  value={formatCurrency(groupStats.achievedAce)} 
                  subValue={`${formatPercent(groupStats.progress)} Prestasi Kumpulan`}
                  icon={<TrendingUp className="w-5 h-5 text-emerald-700" />}
                  color="emerald"
                  progress={groupStats.progress}
                  percentage={`${Math.round(groupStats.progress * 100)}%`}
                />
                <StatCard 
                  title="Sisa Baki Gap Kumpulan" 
                  value={formatCurrency(Math.max(0, groupStats.targetAce - groupStats.achievedAce))}
                  subValue={`Sasaran Kumpulan: ${formatCurrency(groupStats.targetAce)}`}
                  icon={<AlertCircle className="w-5 h-5 text-rose-600" />}
                  color="rose"
                  isGap
                />
                <StatCard 
                  title="KPI Purata Saiz Kes (ACS)" 
                  value={formatCurrency(groupStats.avgCaseSize)} 
                  subValue={`Dari ${formatNumber(groupStats.cases)} Kes Berkumpulan`}
                  icon={<PieChart className="w-5 h-5 text-slate-600" />}
                  color="slate"
                />
              </div>
            )}

            {/* List Row Ejen & Progress overview */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-emerald-600" />
                    {(isLead || simulatedLead)
                      ? `Scoreboard ${scoreboardType === 'annual' ? "Kumulatif Tahunan" : `Prestasi Bulanan (${MONTH_FULL_NAMES[selectedScoreboardMonthIdx]})`}`
                      : `Scoreboard Saya ${scoreboardType === 'annual' ? "(Kumulatif Tahunan)" : `(Prestasi Bulanan - ${MONTH_FULL_NAMES[selectedScoreboardMonthIdx]})`}`
                    }
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {(isLead || simulatedLead)
                      ? "Pantau baki gap, jumlah kes dan pencapaian ACE secara langsung untuk setiap ejen di bawah kawalan anda."
                      : "Pantau baki gap, jumlah kes dan pencapaian ACE peribadi anda pada scoreboard."
                    }
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {/* Scoreboard Type Switcher */}
                  <div className="bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 flex items-center gap-1">
                    <button
                      onClick={() => setScoreboardType('annual')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all select-none cursor-pointer whitespace-nowrap",
                        scoreboardType === 'annual' 
                          ? "bg-white text-emerald-800 shadow-xs" 
                          : "text-slate-500 hover:text-slate-850"
                      )}
                    >
                      Kumulatif Tahunan
                    </button>
                    <button
                      onClick={() => setScoreboardType('monthly')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all select-none cursor-pointer whitespace-nowrap",
                        scoreboardType === 'monthly' 
                          ? "bg-white text-emerald-800 shadow-xs" 
                          : "text-slate-500 hover:text-slate-850"
                      )}
                    >
                      Prestasi Bulanan
                    </button>
                  </div>

                  {/* Month Selector Horizontal Tabs Switcher */}
                  {scoreboardType === 'monthly' && (
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 mt-2 lg:mt-0 max-w-full no-scrollbar">
                      <div className="flex flex-wrap sm:flex-nowrap gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                        {MONTH_ABBRS.map((mName, mIdx) => {
                          const isSelected = selectedScoreboardMonthIdx === mIdx;
                          return (
                            <button
                              key={mIdx}
                              onClick={() => setSelectedScoreboardMonthIdx(mIdx)}
                              className={cn(
                                "px-2 focus:outline-none py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all select-none cursor-pointer whitespace-nowrap",
                                isSelected 
                                  ? "bg-white text-emerald-800 shadow-xs border border-slate-200/20 font-black scale-[1.03]" 
                                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                              )}
                            >
                              {mName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(isLead || simulatedLead) && (
                    <div className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-3 py-1.5 rounded-xl uppercase tracking-wider flex items-center gap-1.5 select-none self-start sm:self-auto">
                      <Check className="w-3.5 h-3.5" />
                      Live Sync
                    </div>
                  )}
                </div>
              </div>

              {sortedScoreboardTargets.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-4 animate-bounce" />
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1">Tiada Data Ejen Lain Dijumpai</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    Belum ada ejen lain yang mendaftar dan menyelaraskan sasaran mereka untuk tahun kewangan ini, atau anda belum mengaktifkan Mod Simulasi di atas.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="py-4 px-6 w-16 text-center">Rank</th>
                        <th className="py-4 px-6">Nama Ejen / Email</th>
                        <th className="py-4 px-6 text-right font-black">
                          {scoreboardType === 'annual' ? "Sasaran ACE Tahun" : `Sasaran ACE (${MONTH_ABBRS[selectedScoreboardMonthIdx]})`}
                        </th>
                        <th className="py-4 px-6 text-right font-black">
                          {scoreboardType === 'annual' ? "Pencapaian Semasa" : `Pencapaian ACE (${MONTH_ABBRS[selectedScoreboardMonthIdx]})`}
                        </th>
                        <th className="py-4 px-6 text-right font-black">
                          {scoreboardType === 'annual' ? "Jumlah Kes" : `Jumlah Kes (${MONTH_ABBRS[selectedScoreboardMonthIdx]})`}
                        </th>
                        <th className="py-4 px-6">Graf Kemajuan</th>
                        <th className="py-4 px-6 text-center">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedScoreboardTargets.map((agentTarget, idx) => {
                        const currentMonthData = agentTarget.monthlyBreakdown?.[selectedScoreboardMonthIdx] || {};
                        
                        const targetAce = scoreboardType === 'annual' 
                          ? agentTarget.overallTargetAce 
                          : (currentMonthData.targetAce || 0);

                        const achievedAce = scoreboardType === 'annual'
                          ? (agentTarget.monthlyBreakdown?.reduce((sum: number, m: any) => sum + (m.achievedAce || 0), 0) || 0)
                          : (currentMonthData.achievedAce || 0);

                        const cases = scoreboardType === 'annual'
                          ? (agentTarget.monthlyBreakdown?.reduce((sum: number, m: any) => sum + (m.cases || 0), 0) || 0)
                          : (currentMonthData.cases || 0);

                        const progressPercent = targetAce > 0 ? (achievedAce / targetAce) : 0;

                        const getRankBadge = (rankIdx: number) => {
                          return (
                            <span className="text-slate-500 font-mono text-[10px] font-bold tracking-tight bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-md">
                              #{rankIdx + 1}
                            </span>
                          );
                        };

                        return (
                          <tr key={agentTarget.targetId} className="hover:bg-slate-50/75 transition-all text-xs">
                            <td className="py-4 px-6 text-center whitespace-nowrap">
                              {getRankBadge(idx)}
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2 group">
                                <p className="font-bold text-slate-700">{agentTarget.agentName}</p>
                                {(isLead || simulatedLead) && (
                                  <button
                                    onClick={() => {
                                      setEditedName(agentTarget.agentName || "");
                                      setEditingAgentId(agentTarget.agentId);
                                      setEditingAgentEmail(agentTarget.agentEmail || "");
                                      setIsEditingName(true);
                                    }}
                                    title="Edit Nama Ejen"
                                    className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded transition-all cursor-pointer active:scale-90"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{agentTarget.agentEmail}</p>
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-slate-600">
                              {agentTarget.uninitialized ? (
                                <span className="text-[10px] text-amber-500 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-md font-bold tracking-wide">SASARAN BELUM SET</span>
                              ) : formatCurrency(targetAce)}
                            </td>
                            <td className="py-4 px-6 text-right font-black text-emerald-700">
                              {agentTarget.uninitialized ? "RM 0" : formatCurrency(achievedAce)}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-slate-500">
                              {agentTarget.uninitialized ? "0 kes" : `${formatNumber(cases)} kes`}
                            </td>
                            <td className="py-4 px-6 min-w-[180px]">
                              {agentTarget.uninitialized ? (
                                <span className="text-[10px] text-slate-400 italic">Data belum diselaraskan</span>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                      style={{ width: `${Math.min(1, progressPercent) * 100}%` }}
                                    />
                                  </div>
                                  <span className={cn(
                                    "text-[10px] font-black px-1.5 py-0.5 rounded-full",
                                    progressPercent >= 1 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                                  )}>
                                    {Math.round(progressPercent * 100)}%
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-6 text-center whitespace-nowrap">
                              {agentTarget.uninitialized ? (
                                <span className="text-[10px] text-slate-400 font-bold bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-150">Kemas Kini Belum Mengalir</span>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => {
                                      setActiveAgentView(agentTarget);
                                      setActiveTab('personal');
                                    }}
                                    className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 active:scale-95 transition-all text-emerald-800 text-[10px] uppercase font-black tracking-widest py-1.5 px-3 rounded-lg border border-emerald-200/50 cursor-pointer border-0"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    Lihat Statistik
                                  </button>

                                  {(isLead || simulatedLead) && (
                                    <button
                                      onClick={() => {
                                        const noteVal = simulatedLead 
                                          ? (simulatedNotes[agentTarget.agentId] || "") 
                                          : (agentNotes[agentTarget.agentId] || "");
                                        setSelectedAgentForNote(agentTarget);
                                        setTempNoteText(noteVal);
                                        setIsEditingNote(true);
                                      }}
                                      className={cn(
                                        "inline-flex items-center gap-1.5 text-[10px] uppercase font-black tracking-widest py-1.5 px-3 rounded-lg border cursor-pointer transition-all active:scale-95 border-0",
                                        (simulatedLead ? simulatedNotes[agentTarget.agentId] : agentNotes[agentTarget.agentId])
                                          ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200/50"
                                          : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      {(simulatedLead ? simulatedNotes[agentTarget.agentId] : agentNotes[agentTarget.agentId]) ? "Nota Khas" : "Tambah Nota"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      <footer className="h-12 px-8 flex items-center justify-between bg-white border-t border-slate-200 text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-12 bg-slate-50/50">
        <div className="flex space-x-6">
          <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></div> Sistem Beroperasi</span>
          <span className="flex items-center">
            <RefreshCw className={cn("w-2.5 h-2.5 mr-1.5 text-emerald-600", showSaveSuccess && "animate-spin")} /> 
            Data Auto-Simpan (LocalStorage)
          </span>
          <span>FY April - Mac</span>
        </div>
        <div className="font-black text-slate-500 tracking-tighter">Goal Tracker Pro · INFAQ Consultancy</div>
      </footer>

      {/* Data Entry Modal */}
      <DataEntryForm 
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        data={data}
        onSave={handleSaveData}
      />

      {/* Share Modal Backdrop */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-lg w-full rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-100 relative overflow-hidden text-center"
            >
              <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-100">
                <Share2 className="w-8 h-8 animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Kongsikan Goal Tracker Pro</h3>
              <p className="text-slate-500 text-xs mt-2.5 leading-relaxed">
                Hantar pautan aplikasi ini kepada ejen-ejen lain di bawah kumpulan <strong>INFAQ Consultancy</strong>. 
                Apabila mereka mendaftar masuk menerusi akaun Google masing-masing, mereka boleh merekod data kpi mereka sendiri dan pencapaian mereka akan terpapar secara langsung di Panel Ketua anda!
              </p>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between gap-3 mt-6">
                <span className="text-[10px] font-mono text-slate-500 truncate select-all flex-grow text-left">
                  {getShareUrl()}
                </span>
                <button
                  onClick={copyShareLink}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all text-white text-[10px] uppercase font-black tracking-widest py-2 px-4 rounded-lg flex-shrink-0 cursor-pointer border-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Berjaya Disalin!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Salin Pautan
                    </>
                  )}
                </button>
              </div>

              <button 
                onClick={() => setShowShareModal(false)}
                className="w-full mt-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border-0"
              >
                Tutup
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Name Modal Backdrop */}
      <AnimatePresence>
        {isEditingName && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-md w-full rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-100 relative overflow-hidden"
            >
              <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mb-6 border border-emerald-100">
                <Edit3 className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Kemaskini Nama Ejen</h3>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                Kemaskini nama anda untuk rekod dashboard peribadi dan scoreboard secara umum.
              </p>

              <form onSubmit={(e) => { e.preventDefault(); handleUpdateName(editedName); }} className="mt-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-black">Nama Penuh Ejen</label>
                  <input 
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    placeholder="Masukkan nama penuh"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button 
                    type="button"
                    onClick={() => setIsEditingName(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border-0 font-sans"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    disabled={!editedName.trim() || isSyncing}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border-0 flex items-center justify-center gap-1.5 font-sans"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Simpan Rekod
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Note Modal Backdrop */}
      <AnimatePresence>
        {isEditingNote && selectedAgentForNote && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-lg w-full rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-100 relative overflow-hidden"
            >
              <div className="w-14 h-14 bg-amber-50 text-amber-700 rounded-2xl flex items-center justify-center mb-6 border border-amber-100">
                <FileText className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Nota Khas: {selectedAgentForNote.agentName}</h3>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-sans">
                Tulis nota pemerhatian atau maklum balas khas untuk ejen ini. Nota ini **hanya boleh diakses dan diedit oleh anda sebagai Admin (Ketua Kumpulan)**.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-black font-sans">Isi Nota Pemerhatian</label>
                  <textarea 
                    value={tempNoteText}
                    onChange={(e) => setTempNoteText(e.target.value)}
                    placeholder="Contoh: Fokus pada aktiviti prospek minggu ini, sasaran kes perlu diperkemas..."
                    rows={6}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-sans resize-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditingNote(false);
                      setSelectedAgentForNote(null);
                    }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border-0 font-sans"
                  >
                    Batal
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveNote}
                    disabled={isSavingNote}
                    className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer border-0 flex items-center justify-center gap-1.5 font-sans"
                  >
                    {isSavingNote ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Simpan Nota
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value, subValue, icon, color, progress, percentage, isGap }: { 
  title: string, 
  value: string, 
  subValue: string, 
  icon: React.ReactNode, 
  color: 'emerald' | 'rose' | 'slate',
  progress?: number,
  percentage?: string,
  isGap?: boolean
}) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className={cn(
        "bg-white p-5 rounded-2xl shadow-sm border flex flex-col justify-between h-36 transition-all",
        isGap ? "border-rose-100 bg-rose-50/30" : "border-slate-200"
      )}
    >
      <div className="flex justify-between items-start">
        <p className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          isGap ? "text-rose-600" : "text-slate-500"
        )}>
          {title}
        </p>
        <div className={cn(
          "p-2 rounded-lg",
          isGap ? "bg-rose-100/50" : "bg-slate-50"
        )}>
          {icon}
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <h4 className={cn(
            "text-3xl font-bold tracking-tight",
            color === 'emerald' ? "text-emerald-700" : 
            color === 'rose' ? "text-rose-600 italic" : "text-slate-800"
          )}>
            {value}
          </h4>
          {percentage && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black">
              {percentage}
            </span>
          )}
        </div>
        <p className={cn(
          "text-[10px] font-bold uppercase tracking-widest mt-1",
          isGap ? "text-rose-400" : "text-slate-400"
        )}>
          {subValue}
        </p>
      </div>
    </motion.div>
  );
}

function ActionItem({ title, desc, status }: { title: string, desc: string, status: 'urgent' | 'warning' | 'info' }) {
  const statusStyles = {
    urgent: "bg-rose-50/50 text-rose-700 border-rose-100",
    warning: "bg-amber-50/50 text-amber-700 border-amber-100",
    info: "bg-emerald-50/50 text-emerald-700 border-emerald-100"
  };

  return (
    <div className={cn("p-4 rounded-xl border border-dashed flex gap-3 items-start transition-all hover:shadow-sm", statusStyles[status])}>
      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
      <div>
        <p className="font-bold text-[11px] uppercase tracking-wider">{title}</p>
        <p className="text-[11px] opacity-80 leading-relaxed mt-1">{desc}</p>
      </div>
    </div>

  );
}
