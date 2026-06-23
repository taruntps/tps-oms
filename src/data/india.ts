// All Indian States + UTs with major cities
export const INDIA_STATES: { state: string; cities: string[] }[] = [
  { state: 'Andhra Pradesh', cities: ['Visakhapatnam','Vijayawada','Guntur','Nellore','Kurnool','Rajahmundry','Kakinada','Tirupati','Kadapa','Anantapur'] },
  { state: 'Arunachal Pradesh', cities: ['Itanagar','Naharlagun','Pasighat','Tezpur'] },
  { state: 'Assam', cities: ['Guwahati','Dibrugarh','Silchar','Jorhat','Nagaon','Tinsukia','Tezpur','Bongaigaon'] },
  { state: 'Bihar', cities: ['Patna','Gaya','Bhagalpur','Muzaffarpur','Purnia','Darbhanga','Arrah','Bihar Sharif','Begusarai'] },
  { state: 'Chhattisgarh', cities: ['Raipur','Bhilai','Bilaspur','Korba','Durg','Rajnandgaon','Jagdalpur'] },
  { state: 'Goa', cities: ['Panaji','Margao','Vasco da Gama','Mapusa','Ponda'] },
  { state: 'Gujarat', cities: ['Ahmedabad','Surat','Vadodara','Rajkot','Bhavnagar','Jamnagar','Junagadh','Gandhinagar','Anand','Mehsana','Morbi'] },
  { state: 'Haryana', cities: ['Faridabad','Gurgaon','Panipat','Ambala','Yamunanagar','Rohtak','Hisar','Karnal','Sonipat','Panchkula','Bhiwani'] },
  { state: 'Himachal Pradesh', cities: ['Shimla','Dharamshala','Solan','Mandi','Baddi','Nahan','Palampur','Hamirpur'] },
  { state: 'Jharkhand', cities: ['Ranchi','Jamshedpur','Dhanbad','Bokaro','Deoghar','Phusro','Hazaribag','Giridih'] },
  { state: 'Karnataka', cities: ['Bengaluru','Mysuru','Hubballi','Mangaluru','Belagavi','Kalaburagi','Davangere','Ballari','Vijayapura','Shivamogga'] },
  { state: 'Kerala', cities: ['Thiruvananthapuram','Kochi','Kozhikode','Kollam','Thrissur','Alappuzha','Palakkad','Malappuram','Kottayam','Kannur'] },
  { state: 'Madhya Pradesh', cities: ['Indore','Bhopal','Jabalpur','Gwalior','Ujjain','Sagar','Dewas','Satna','Ratlam','Rewa'] },
  { state: 'Maharashtra', cities: ['Mumbai','Pune','Nagpur','Nashik','Aurangabad','Solapur','Amravati','Thane','Navi Mumbai','Kolhapur','Akola'] },
  { state: 'Manipur', cities: ['Imphal','Thoubal','Bishnupur','Churachandpur'] },
  { state: 'Meghalaya', cities: ['Shillong','Tura','Jowai'] },
  { state: 'Mizoram', cities: ['Aizawl','Lunglei','Champhai'] },
  { state: 'Nagaland', cities: ['Kohima','Dimapur','Mokokchung'] },
  { state: 'Odisha', cities: ['Bhubaneswar','Cuttack','Rourkela','Berhampur','Sambalpur','Puri','Balasore','Bhadrak'] },
  { state: 'Punjab', cities: ['Ludhiana','Amritsar','Jalandhar','Patiala','Bathinda','Mohali','Hoshiarpur','Pathankot','Moga','Phagwara','Zirakpur'] },
  { state: 'Rajasthan', cities: ['Jaipur','Jodhpur','Kota','Bikaner','Ajmer','Udaipur','Bhilwara','Alwar','Bharatpur','Sikar','Sri Ganganagar'] },
  { state: 'Sikkim', cities: ['Gangtok','Namchi','Jorethang'] },
  { state: 'Tamil Nadu', cities: ['Chennai','Coimbatore','Madurai','Tiruchirappalli','Salem','Tirunelveli','Tiruppur','Vellore','Erode','Thoothukkudi'] },
  { state: 'Telangana', cities: ['Hyderabad','Warangal','Nizamabad','Karimnagar','Khammam','Ramagundam','Secunderabad'] },
  { state: 'Tripura', cities: ['Agartala','Udaipur','Dharmanagar'] },
  { state: 'Uttar Pradesh', cities: ['Lucknow','Kanpur','Agra','Varanasi','Meerut','Prayagraj','Ghaziabad','Noida','Bareilly','Aligarh','Moradabad','Gorakhpur'] },
  { state: 'Uttarakhand', cities: ['Dehradun','Haridwar','Roorkee','Haldwani','Rudrapur','Kashipur','Rishikesh'] },
  { state: 'West Bengal', cities: ['Kolkata','Howrah','Durgapur','Asansol','Siliguri','Bardhaman','Malda','Barasat','Krishnanagar'] },
  // Union Territories
  { state: 'Andaman & Nicobar Islands', cities: ['Port Blair'] },
  { state: 'Chandigarh', cities: ['Chandigarh'] },
  { state: 'Dadra & Nagar Haveli and Daman & Diu', cities: ['Daman','Diu','Silvassa'] },
  { state: 'Delhi', cities: ['New Delhi','Delhi','Dwarka','Rohini','Pitampura','Lajpat Nagar','Saket','Janakpuri'] },
  { state: 'Jammu & Kashmir', cities: ['Srinagar','Jammu','Anantnag','Baramulla','Sopore'] },
  { state: 'Ladakh', cities: ['Leh','Kargil'] },
  { state: 'Lakshadweep', cities: ['Kavaratti'] },
  { state: 'Puducherry', cities: ['Puducherry','Karaikal','Mahe','Yanam'] },
]

export const STATE_NAMES = INDIA_STATES.map(s => s.state)

export function getCitiesForState(state: string): string[] {
  return INDIA_STATES.find(s => s.state === state)?.cities ?? []
}

export const FBO_CATEGORIES = [
  'Manufacturer',
  'Relabeller',
  'Repacker',
  'Importer',
  'Retailer',
  'Wholesaler / Distributor',
  'Storage Unit',
  'Transporter',
  'Trade / Retail',
  'E-commerce',
  'Petty Food Business',
]

export const SERVICE_TYPES = [
  'New Application',
  'Modification',
  'Renewal',
  'Form II',
  'Artwork',
  'Claim Check',
  'Annual Return',
]
