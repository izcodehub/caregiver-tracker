# Pending Mobile App Features

This document outlines features that require implementation in the mobile check-in/check-out application.

## 1. Training Mode (Binome ADV) ✅ Database Ready

### Database Migration
- ✅ Added `is_training` boolean field to `check_in_outs` table
- ✅ Migration file: `supabase/migration_add_training_field.sql`
- ⚠️ **Action Required**: Run this migration in Supabase SQL Editor

### Mobile App Changes Needed

#### Check-In Screen
Add a checkbox or toggle for "Training/Formation (Binome ADV)":

```typescript
// Example implementation
const [isTraining, setIsTraining] = useState(false);

// When submitting check-in
const checkIn = async () => {
  const { data, error } = await supabase
    .from('check_in_outs')
    .insert({
      beneficiary_id: beneficiaryId,
      caregiver_name: caregiverName,
      action: 'check-in',
      timestamp: new Date().toISOString(),
      is_training: isTraining, // ← New field
      photo_url: photoUrl,
      latitude: location.latitude,
      longitude: location.longitude
    });
};
```

#### UI Mockup
```
┌─────────────────────────────────┐
│ Check-In                        │
├─────────────────────────────────┤
│ Name: [Nawal YASSINE         ]  │
│                                 │
│ □ Training/Formation            │
│   (Binome ADV - Not Charged)    │
│                                 │
│ [Take Photo]  [📷]              │
│                                 │
│ [Check In]                      │
└─────────────────────────────────┘
```

### Dashboard Changes (Already Handled)
The financial calculation components need to be updated to exclude training sessions:

**File**: `components/CaregiverBreakdown.tsx`
```typescript
// Filter out training sessions when calculating hours
const calculateHoursPerCaregiver = (): CaregiverSummary[] => {
  // ... existing code ...

  // Skip if training session
  if (sorted[i].is_training) {
    continue; // Don't count training hours
  }

  // ... rest of calculation ...
};
```

---

## 2. Check-Out Caregiver Dropdown 🔄 Needs Implementation

### Requirement
When checking out, show a dropdown with names of currently checked-in caregivers at that location, with the first name pre-selected.

### Mobile App Implementation

#### Step 1: Fetch Active Caregivers
```typescript
const getActiveCaregivers = async (beneficiaryId: string) => {
  // Get all check-ins for today
  const today = new Date().toISOString().split('T')[0];

  const { data: checkIns, error } = await supabase
    .from('check_in_outs')
    .select('*')
    .eq('beneficiary_id', beneficiaryId)
    .gte('timestamp', `${today}T00:00:00`)
    .lte('timestamp', `${today}T23:59:59`)
    .order('timestamp', { ascending: true });

  if (error) return [];

  // Determine who is currently checked in
  const activeMap = new Map<string, boolean>();

  checkIns.forEach(ci => {
    if (ci.action === 'check-in') {
      activeMap.set(ci.caregiver_name, true);
    } else if (ci.action === 'check-out') {
      activeMap.set(ci.caregiver_name, false);
    }
  });

  // Return only those currently checked in
  return Array.from(activeMap.entries())
    .filter(([_, isActive]) => isActive)
    .map(([name, _]) => name);
};
```

#### Step 2: Check-Out Screen with Dropdown
```typescript
const CheckOutScreen = ({ beneficiaryId }) => {
  const [activeCaregivers, setActiveCaregivers] = useState<string[]>([]);
  const [selectedCaregiver, setSelectedCaregiver] = useState('');

  useEffect(() => {
    const loadActiveCaregivers = async () => {
      const caregivers = await getActiveCaregivers(beneficiaryId);
      setActiveCaregivers(caregivers);
      // Pre-select first caregiver
      if (caregivers.length > 0) {
        setSelectedCaregiver(caregivers[0]);
      }
    };
    loadActiveCaregivers();
  }, [beneficiaryId]);

  const handleCheckOut = async () => {
    const { data, error } = await supabase
      .from('check_in_outs')
      .insert({
        beneficiary_id: beneficiaryId,
        caregiver_name: selectedCaregiver, // ← From dropdown
        action: 'check-out',
        timestamp: new Date().toISOString(),
        photo_url: photoUrl,
        latitude: location.latitude,
        longitude: location.longitude
      });
  };

  return (
    <View>
      <Text>Who is checking out?</Text>
      <Picker
        selectedValue={selectedCaregiver}
        onValueChange={setSelectedCaregiver}
      >
        {activeCaregivers.map(name => (
          <Picker.Item key={name} label={name} value={name} />
        ))}
      </Picker>
      <Button title="Check Out" onPress={handleCheckOut} />
    </View>
  );
};
```

#### UI Mockup
```
┌─────────────────────────────────┐
│ Check-Out                       │
├─────────────────────────────────┤
│ Who is checking out?            │
│                                 │
│ ▼ [Nawal YASSINE            ]  │
│   • Nawal YASSINE              │
│   • Marie DUBOIS               │
│                                 │
│ [Take Photo]  [📷]              │
│                                 │
│ [Check Out]                     │
└─────────────────────────────────┘
```

---

## Implementation Checklist

### Database
- [x] Create migration for `is_training` field
- [ ] Run migration in Supabase

### Mobile App
- [ ] Add training checkbox to check-in screen
- [ ] Implement active caregivers fetch logic
- [ ] Add dropdown to check-out screen with pre-selection
- [ ] Test with multiple caregivers
- [ ] Test training mode flag is saved correctly

### Dashboard (Web)
- [x] Calendar day view updated to match history layout
- [ ] Update `CaregiverBreakdown.tsx` to exclude training hours
- [ ] Add `is_training` to CheckInOut type
- [ ] Display training indicator in check-in history
- [ ] Display training indicator in calendar day view

### Testing Scenarios
1. **Single Caregiver**: Check-in and check-out with one person
2. **Multiple Caregivers**: Two caregivers checked in, verify dropdown shows both
3. **Training Mode**: Check-in with training flag, verify not billed
4. **Binome ADV**: Two caregivers at same time, one training
5. **Edge Cases**: Check-out when no one checked in (should show empty or error)

---

## Notes

- **Binome ADV**: French agency term for training pairs where trainee is not charged
- **Pre-selection**: First caregiver in list auto-selected for faster check-out
- **Training Flag**: Must carry through check-in to check-out (associate by timestamp/caregiver)
