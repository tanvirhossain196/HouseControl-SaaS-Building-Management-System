export type UnitStatus = 'paid' | 'due' | 'overdue' | 'vacant'

export type Unit = {
  id: string
  resident: string
  members: number
  rent: number
  status: UnitStatus
  /** Negative means overdue by that many days. */
  daysToDue: number
  note: string
}

export type Floor = { label: string; units: Unit[] }

export type GateEntry = {
  time: string
  name: string
  flat: string
  state: 'In' | 'Out' | 'Approved'
}

export type Building = {
  name: string
  address: string
  floors: Floor[]
  gate: GateEntry[]
}

/** Sample data for the landing-page building panel — one 6-storey walk-up in Mirpur. */
export const demoBuilding: Building = {
  name: 'Nasreen Tower',
  address: 'Road 7, Mirpur DOHS, Dhaka',
  floors: [
    {
      label: '6',
      units: [
        {
          id: '6A',
          resident: 'Rahim Chowdhury',
          members: 4,
          rent: 26000,
          status: 'paid',
          daysToDue: 6,
          note: 'Paid by bKash on the 2nd',
        },
        {
          id: '6B',
          resident: 'Vacant',
          members: 0,
          rent: 26000,
          status: 'vacant',
          daysToDue: 0,
          note: 'Available from 1 October',
        },
      ],
    },
    {
      label: '5',
      units: [
        {
          id: '5A',
          resident: 'Tanvir Ahmed',
          members: 3,
          rent: 24500,
          status: 'paid',
          daysToDue: 6,
          note: 'Paid in full, receipt sent',
        },
        {
          id: '5B',
          resident: 'Shirin Akter',
          members: 5,
          rent: 24500,
          status: 'due',
          daysToDue: 3,
          note: 'Reminder goes out tomorrow',
        },
      ],
    },
    {
      label: '4',
      units: [
        {
          id: '4A',
          resident: 'Kamrul Hasan',
          members: 2,
          rent: 23000,
          status: 'overdue',
          daysToDue: -4,
          note: 'Part payment received, ৳9,000 left',
        },
        {
          id: '4B',
          resident: 'Farhana Islam',
          members: 4,
          rent: 23000,
          status: 'paid',
          daysToDue: 6,
          note: 'Paid by bank transfer',
        },
      ],
    },
    {
      label: '3',
      units: [
        {
          id: '3A',
          resident: 'Sabbir Rahman',
          members: 3,
          rent: 22000,
          status: 'paid',
          daysToDue: 6,
          note: 'Paid, gas bill split applied',
        },
        {
          id: '3B',
          resident: 'Nusrat Jahan',
          members: 2,
          rent: 22000,
          status: 'due',
          daysToDue: 1,
          note: 'Due tomorrow',
        },
      ],
    },
    {
      label: '2',
      units: [
        {
          id: '2A',
          resident: 'Imran Kabir',
          members: 4,
          rent: 21000,
          status: 'paid',
          daysToDue: 6,
          note: 'Paid, lift repair share included',
        },
        {
          id: '2B',
          resident: 'Mahmuda Begum',
          members: 3,
          rent: 21000,
          status: 'paid',
          daysToDue: 6,
          note: 'Paid on the 1st',
        },
      ],
    },
    {
      label: 'G',
      units: [
        {
          id: 'G1',
          resident: 'Rafi General Store',
          members: 1,
          rent: 32000,
          status: 'paid',
          daysToDue: 6,
          note: 'Shop lease, paid quarterly',
        },
        {
          id: 'G2',
          resident: 'Caretaker quarters',
          members: 1,
          rent: 0,
          status: 'vacant',
          daysToDue: 0,
          note: 'Staff unit, no rent charged',
        },
      ],
    },
  ],
  gate: [
    { time: '09:12', name: 'Daraz courier', flat: '5B', state: 'In' },
    { time: '10:04', name: 'Gas meter reader', flat: 'All flats', state: 'In' },
    { time: '11:30', name: 'Aunt of 3A', flat: '3A', state: 'Approved' },
    { time: '12:45', name: 'Plumber (lift pit)', flat: 'Building', state: 'Out' },
  ],
}

export const statusLabel: Record<UnitStatus, string> = {
  paid: 'Rent paid',
  due: 'Payment due',
  overdue: 'Overdue',
  vacant: 'Vacant',
}
