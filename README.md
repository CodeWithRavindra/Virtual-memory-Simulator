# 🧠 Virtual Memory Simulation Tool

A visual and interactive tool to understand how operating systems manage memory using different page replacement algorithms like FIFO, LRU, and Optimal.

---

## 📌 Introduction

This project is designed to help students easily understand memory management concepts in Operating Systems. It simulates how pages are loaded into memory and replaced when the memory becomes full.

---

## 🎯 Features

* Simulates FIFO, LRU, and Optimal algorithms
* Shows step-by-step memory changes
* Displays Page Hits and Page Faults
* Simple and user-friendly interface

---

## 🧠 Algorithms Explained

### 🔹 FIFO (First In First Out)

Removes the page that entered memory first.

### 🔹 LRU (Least Recently Used)

Removes the page that has not been used for the longest time.

### 🔹 Optimal

Removes the page that will not be used for the longest time in the future.

---

## ⚙️ How to Run the Project

1. Clone the repository
2. Open the project folder
3. Run the project using:

   ```bash
   npm install
   npm run dev
   ```
4. Open in browser (usually http://localhost:5173)

---

## 📊 Example

Frame Size: 3
Pages: 1 2 3 4 1 2 5

Output:
Page Faults: 6
Page Hits: 1

---

## 📂 Project Structure

```
├── src/
├── public/
├── index.html
├── package.json
├── README.md
```

---

## 👨‍💻 Team Members

* Ravindar Singh
* Arko ghosh
* Mohammed shoukath

---

## 🚀 Future Improvements

* Add more algorithms
* Improve UI/UX
* Add graph visualization

---

## ⭐ Conclusion

This tool provides a clear and visual way to understand page replacement algorithms and helps students learn Operating System concepts easily.
