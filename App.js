import { Text, View, TextInput, ScrollView, TouchableOpacity, Animated, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Toast component for non-intrusive messages
const Toast = ({ message, visible, onHide }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => onHide());
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 100,
        left: 20,
        right: 20,
        backgroundColor: '#4CAF50',
        padding: 15,
        borderRadius: 8,
        opacity: fadeAnim,
        transform: [{
          translateY: fadeAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        }],
      }}
    >
      <Text style={{ color: 'white', textAlign: 'center' }}>{message}</Text>
    </Animated.View>
  );
};

// Time unit selector component
const TimeUnitSelector = ({ selectedUnit, onSelectUnit }) => {
  const units = ['seconds', 'minutes', 'hours'];
  
  return (
    <View style={{ flexDirection: 'row', marginBottom: 15, justifyContent: 'space-between' }}>
      {units.map((unit) => (
        <TouchableOpacity
          key={unit}
          style={{
            backgroundColor: selectedUnit === unit ? '#007AFF' : '#333',
            padding: 10,
            borderRadius: 8,
            flex: 0.3,
          }}
          onPress={() => onSelectUnit(unit)}
        >
          <Text style={{ 
            color: 'white', 
            textAlign: 'center',
            fontWeight: selectedUnit === unit ? 'bold' : 'normal'
          }}>
            {unit.charAt(0).toUpperCase() + unit.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// Time formatting utilities
const formatTo12Hour = (date) => {
  return date.toLocaleString('en-US', { 
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true 
  });
};

export default function App() {
  const [reminderText, setReminderText] = useState('');
  const [timeValue, setTimeValue] = useState('');
  const [timeUnit, setTimeUnit] = useState('minutes');
  const [reminders, setReminders] = useState([]);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const appState = useRef(AppState.currentState);

  // Initialize notifications and setup handlers
  useEffect(() => {
    registerForPushNotificationsAsync();
    const notificationSubscription = setupNotificationHandler();
    const appStateSubscription = setupAppStateHandler();
    const cleanupInterval = setInterval(cleanupExpiredReminders, 60000);

    return () => {
      notificationSubscription.remove();
      appStateSubscription.remove();
      clearInterval(cleanupInterval);
    };
  }, []);

  // Setup notification handler
  const setupNotificationHandler = () => {
    return Notifications.addNotificationReceivedListener(notification => {
      const identifier = notification.request.identifier;
      cleanupReminder(identifier);
    });
  };

  // Setup app state handler
  const setupAppStateHandler = () => {
    return AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) && 
        nextAppState === 'active'
      ) {
        cleanupExpiredReminders();
      }
      appState.current = nextAppState;
    });
  };

  // Clean up expired reminders
  const cleanupExpiredReminders = () => {
    const now = new Date().getTime();
    setReminders(current => 
      current.filter(reminder => {
        const reminderTime = new Date(reminder.scheduledFor).getTime();
        return reminderTime > now;
      })
    );
  };

  // Clean up specific reminder
  const cleanupReminder = (id) => {
    setReminders(current => current.filter(reminder => reminder.id !== id));
  };

  // Show toast message
  const showToast = (message) => {
    setToastMessage(message);
    setToastVisible(true);
  };

  // Register for push notifications
  async function registerForPushNotificationsAsync() {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      showToast('Failed to get notification permissions');
      return;
    }
  }

  // Convert time units to milliseconds
  const getMilliseconds = (value, unit) => {
    const numValue = parseInt(value);
    switch (unit) {
      case 'seconds':
        return numValue * 1000;
      case 'minutes':
        return numValue * 60 * 1000;
      case 'hours':
        return numValue * 60 * 60 * 1000;
      default:
        return numValue * 1000;
    }
  };

  // Format time left for display
  const formatTimeLeft = (value, unit) => {
    switch (unit) {
      case 'seconds':
        return `${value} seconds`;
      case 'minutes':
        return `${value} minutes`;
      case 'hours':
        return `${value} hours`;
      default:
        return `${value} ${unit}`;
    }
  };

  // Schedule a new reminder
  const scheduleReminder = async () => {
    if (!reminderText || !timeValue) {
      showToast('Please enter both reminder text and time');
      return;
    }

    const numValue = parseInt(timeValue);
    if (isNaN(numValue) || numValue <= 0) {
      showToast('Please enter a valid number');
      return;
    }

    try {
      const milliseconds = getMilliseconds(timeValue, timeUnit);
      const trigger = new Date(Date.now() + milliseconds);
      
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Reminder!',
          body: reminderText,
          sound: true,
        },
        trigger,
      });

      setReminders(current => [...current, {
        id,
        text: reminderText,
        timeValue: numValue,
        timeUnit,
        scheduledFor: trigger.toISOString(),
      }]);

      setReminderText('');
      setTimeValue('');
      showToast('Reminder set successfully');
    } catch (error) {
      showToast('Error setting reminder');
    }
  };

  // Cancel a reminder
  const cancelReminder = async (id) => {
    await Notifications.cancelScheduledNotificationAsync(id);
    cleanupReminder(id);
    showToast('Reminder cancelled');
  };

  return (
    <View style={{
      flex: 1,
      padding: 20,
      backgroundColor: '#1a1a1a',
    }}>
      <StatusBar style="light" />
      
      <View style={{ marginTop: 50, marginBottom: 20 }}>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold', textAlign: 'center' }}>
          Quick Reminder
        </Text>
      </View>

      <TextInput
        style={{
          backgroundColor: '#333',
          color: 'white',
          padding: 15,
          borderRadius: 10,
          marginBottom: 15,
        }}
        placeholder="Enter reminder text"
        placeholderTextColor="#666"
        value={reminderText}
        onChangeText={setReminderText}
      />

      <TimeUnitSelector
        selectedUnit={timeUnit}
        onSelectUnit={setTimeUnit}
      />

      <TextInput
        style={{
          backgroundColor: '#333',
          color: 'white',
          padding: 15,
          borderRadius: 10,
          marginBottom: 15,
        }}
        placeholder={`Enter number of ${timeUnit}`}
        placeholderTextColor="#666"
        value={timeValue}
        onChangeText={setTimeValue}
        keyboardType="numeric"
      />

      <TouchableOpacity
        style={{
          backgroundColor: '#007AFF',
          padding: 15,
          borderRadius: 10,
          marginBottom: 20,
        }}
        onPress={scheduleReminder}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
          Set Reminder
        </Text>
      </TouchableOpacity>

      <ScrollView style={{ flex: 1 }}>
        <Text style={{ color: 'white', fontSize: 18, marginBottom: 10 }}>
          Active Reminders:
        </Text>
        {reminders.map((reminder, index) => (
          <View
            key={index}
            style={{
              backgroundColor: '#333',
              padding: 15,
              borderRadius: 10,
              marginBottom: 10,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'white' }}>{reminder.text}</Text>
              <Text style={{ color: '#666', fontSize: 12 }}>
                In {formatTimeLeft(reminder.timeValue, reminder.timeUnit)} (at {formatTo12Hour(new Date(reminder.scheduledFor))})
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => cancelReminder(reminder.id)}
              style={{
                backgroundColor: '#FF3B30',
                padding: 8,
                borderRadius: 5,
              }}
            >
              <Text style={{ color: 'white' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <Toast 
        message={toastMessage}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
      />
    </View>
  );
}