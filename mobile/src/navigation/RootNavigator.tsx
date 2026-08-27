import React from 'react';
import { NavigationContainer, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../screens/AuthScreen';
import RecordScreen from '../screens/RecordScreen';
import HistoryScreen from '../screens/HistoryScreen';
import HistoryDetailScreen from '../screens/HistoryDetailScreen';
import QuestionSettingsScreen from '../screens/QuestionSettingsScreen';
import { DiaryEntry } from '../types';

export type HistoryStackParamList = {
  HistoryList: undefined;
  HistoryDetail: { entry: DiaryEntry };
};

const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();

function HistoryStackNavigator() {
  return (
    <HistoryStack.Navigator>
      <HistoryStack.Screen name="HistoryList" component={HistoryScreen} options={{ title: '지난 기록' }} />
      <HistoryStack.Screen name="HistoryDetail" component={HistoryDetailScreen} options={{ title: '기록 상세' }} />
    </HistoryStack.Navigator>
  );
}

export type MainTabParamList = {
  기록하기: undefined;
  '지난 기록': NavigatorScreenParams<HistoryStackParamList>;
  '질문 설정': undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="기록하기" component={RecordScreen} />
      <Tab.Screen name="지난 기록" component={HistoryStackNavigator} />
      <Tab.Screen name="질문 설정" component={QuestionSettingsScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { userName } = useAuth();

  return <NavigationContainer>{userName ? <MainTabs /> : <AuthScreen />}</NavigationContainer>;
}
